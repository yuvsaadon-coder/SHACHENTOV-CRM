"""Probabilistic threat layer (ECOA) and decision products (KTS, EA candidates, FCOA).

Guiding rule from the spec: probabilistic models *consume* the deterministic
layers as features and never alter them. Everything produced here is an
estimate ("הערכה") with explicit, editable weights - not a fact.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy import ndimage

from . import grid as G
from .mobility import NOGO, MobilityResult
from .routing import DIRS, GridGraph, build_graph, corridor, cost_distance, least_cost_path
from .terrain import crest_lines, distance_to, normalize, slope_percent, tpi
from .visibility import viewshed


def _sample_path(cells, n: int):
    if not cells:
        return []
    idx = np.linspace(0, len(cells) - 1, min(n, len(cells))).round().astype(int)
    return [tuple(cells[i]) for i in idx]


def visibility_fraction(
    grid: G.TerrainGrid,
    points,
    height: float,
    target_height: float,
    max_range_m: float,
    min_range_m: float = 0.0,
) -> np.ndarray:
    """Fraction of `points` that each cell sees (reciprocal cumulative viewshed)."""
    acc = np.zeros(grid.shape)
    if not points:
        return acc
    for p in points:
        vs = viewshed(grid, p, observer_height=height, target_height=target_height, max_range_m=max_range_m)
        vis = vs.visible
        if min_range_m > 0:
            rr, cc = np.ogrid[: grid.shape[0], : grid.shape[1]]
            d = np.hypot(rr - p[0], cc - p[1]) * grid.cell_size
            vis = vis & (d >= min_range_m)
        acc += vis
    return acc / len(points)


# --------------------------------------------------------------------------- AT / ambush likelihood
DEFAULT_AT_WEIGHTS = {
    "bias": -5.0,
    "tpi": 1.5,  # elevated relative position
    "slope": -1.5,  # gentle ground to emplace
    "crest": 1.0,  # close to (behind) a tactical crest
    "v_target": 6.0,  # sees our axis of advance within weapon range
    "cover": 1.2,  # close to cover (built-up edge / tree line)
    "canopy": 0.8,  # concealed from air observation
}


@dataclass
class ThreatResult:
    probability: np.ndarray
    features: dict[str, np.ndarray]
    weights: dict[str, float]
    peaks: list[tuple[int, int, float]] = field(default_factory=list)


def at_position_likelihood(
    grid: G.TerrainGrid,
    friendly_axis: list[tuple[int, int]],
    weights: dict[str, float] | None = None,
    weapon_min_m: float = 300.0,
    weapon_max_m: float = 4000.0,
    samples: int = 24,
) -> ThreatResult:
    """Expert-weighted spatial logistic model P(Y=1|x) = sigmoid(w.x + b) for AT/ambush positions."""
    w = {**DEFAULT_AT_WEIGHTS, **(weights or {})}
    cell = grid.cell_size
    x_tpi = normalize(tpi(grid.dtm, cell, 500.0))
    x_slope = np.clip(slope_percent(grid.dtm, cell) / 60.0, 0, 1)
    crest = crest_lines(grid.dtm, cell)
    x_crest = np.exp(-distance_to(crest, cell) / 150.0)
    pts = _sample_path(friendly_axis, samples)
    # a vehicle on our axis (2.5 m) seen by a crew-served weapon at ~1 m
    x_vt = visibility_fraction(grid, pts, height=2.5, target_height=1.0, max_range_m=weapon_max_m, min_range_m=weapon_min_m)
    edges = (grid.landcover == G.LC_TREE) | (grid.landcover == G.LC_BUILT)
    x_cover = np.exp(-distance_to(edges, cell) / 200.0)
    x_canopy = ((grid.landcover == G.LC_TREE) & (grid.dh > 3)).astype(float)
    feats = {"tpi": x_tpi, "slope": x_slope, "crest": x_crest, "v_target": x_vt, "cover": x_cover, "canopy": x_canopy}
    logit = w["bias"] + sum(w[k] * v for k, v in feats.items())
    p = 1.0 / (1.0 + np.exp(-logit))
    p[grid.landcover == G.LC_WATER] = 0.0
    p[x_vt == 0] *= 0.05  # a position that cannot engage the axis is not a threat to it
    return ThreatResult(p, feats, w, find_peaks(p, cell, min_sep_m=400.0, top=12))


def find_peaks(layer: np.ndarray, cell: float, min_sep_m: float = 400.0, top: int = 12, min_value: float = 0.2):
    """Non-maximum suppression: local maxima separated by at least min_sep_m."""
    size = max(3, int(2 * min_sep_m / cell) | 1)
    mx = ndimage.maximum_filter(layer, size=size, mode="nearest")
    rr, cc = np.nonzero((layer == mx) & (layer >= min_value))
    order = np.argsort(-layer[rr, cc])[:top]
    return [(int(rr[i]), int(cc[i]), float(layer[rr[i], cc[i]])) for i in order]


# --------------------------------------------------------------------------- enemy movement (softmax routing)
def enemy_route_density(
    graph: GridGraph,
    starts: list[tuple[int, int]],
    objective: tuple[int, int],
    tau: float = 1.0,
    walkers: int = 400,
    seed: int = 0,
) -> np.ndarray:
    """Expected traffic density of enemy forces under a softmax routing policy.

    P(j|i) = exp(-(W_ij + V_j)/tau') / sum_k exp(-(W_ik + V_k)/tau'), where V is
    the cost-to-go to the objective (making the policy goal-directed, i.e. a
    randomized shortest path), restricted to moves that reduce V. tau is
    relative: tau' = tau * median edge cost. tau -> 0 gives the single shortest
    path, large tau spreads the forces across all viable approaches.
    """
    rng = np.random.default_rng(seed)
    H, W = graph.shape
    N = H * W
    V, _ = cost_distance(graph, [objective], reverse=True)
    V = V.ravel()
    finite_w = graph.dir_weights[np.isfinite(graph.dir_weights)]
    tau_abs = max(tau, 1e-3) * float(np.median(finite_w)) if finite_w.size else 1.0
    start_idx = np.array([r * W + c for r, c in starts])
    start_idx = start_idx[np.isfinite(V[start_idx])]
    density = np.zeros(N)
    if start_idx.size == 0:
        return density.reshape(H, W)
    cur = start_idx[rng.integers(0, start_idx.size, walkers)]
    alive = np.ones(walkers, dtype=bool)
    goal = objective[0] * W + objective[1]
    offs = DIRS[:, 0] * W + DIRS[:, 1]
    np.add.at(density, cur, 1)
    for _ in range(4 * (H + W)):
        if not alive.any():
            break
        a = np.nonzero(alive)[0]
        c = cur[a]
        r, col = c // W, c % W
        nr = r[None, :] + DIRS[:, 0:1]
        nc = col[None, :] + DIRS[:, 1:2]
        inb = (nr >= 0) & (nr < H) & (nc >= 0) & (nc < W)
        nb = np.where(inb, c[None, :] + offs[:, None], 0)
        wgt = graph.dir_weights[:, c]
        score = wgt + V[nb]
        ok = inb & np.isfinite(score) & (V[nb] < V[c][None, :])
        score = np.where(ok, score, np.inf)
        best = score.min(axis=0)
        stuck = ~np.isfinite(best)
        logits = np.where(ok, -(score - best[None, :]) / tau_abs, -np.inf)
        prob = np.exp(logits)
        prob_sum = prob.sum(axis=0)
        prob = prob / np.where(prob_sum > 0, prob_sum, 1)
        u = rng.random(a.size)
        choice = (np.cumsum(prob, axis=0) < u[None, :]).sum(axis=0).clip(0, 7)
        nxt = nb[choice, np.arange(a.size)]
        nxt = np.where(stuck, c, nxt)
        cur[a] = nxt
        np.add.at(density, nxt[~stuck], 1)
        alive[a[stuck | (nxt == goal)]] = False
    return (density / walkers).reshape(H, W)


# --------------------------------------------------------------------------- key terrain & engagement areas
DEFAULT_KTS_WEIGHTS = {"tpi": 0.3, "observation": 0.4, "betweenness": 0.2, "access": 0.1}


def key_terrain_score(
    grid: G.TerrainGrid,
    avenue_cells: list[tuple[int, int]],
    traffic: np.ndarray,
    access_time_s: np.ndarray,
    weights: dict[str, float] | None = None,
    samples: int = 24,
    max_range_m: float = 4000.0,
) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    """KTS_i = w1 norm(TPI) + w2 |VS_i ∩ AoA|/|AoA| + w3 norm(BC) + w4 Access.

    BC is approximated by the route-traffic density (sampled betweenness of the
    approach network); Access = exp(-t / 30 min) from our start.
    """
    w = {**DEFAULT_KTS_WEIGHTS, **(weights or {})}
    pts = _sample_path(avenue_cells, samples)
    comp = {
        "tpi": normalize(tpi(grid.dtm, grid.cell_size, 750.0)),
        "observation": visibility_fraction(grid, pts, height=2.0, target_height=2.0, max_range_m=max_range_m),
        "betweenness": normalize(ndimage.gaussian_filter(traffic, 2.0), 0, 99.5),
        "access": np.where(np.isfinite(access_time_s), np.exp(-np.nan_to_num(access_time_s, posinf=1e9) / 1800.0), 0.0),
    }
    kts = sum(w[k] * v for k, v in comp.items()) / max(sum(w.values()), 1e-9)
    return kts, comp


def engagement_area_candidates(
    grid: G.TerrainGrid,
    enemy_traffic: np.ndarray,
    enemy_mob: MobilityResult,
    friendly_positions: list[tuple[int, int]],
    min_observers: int = 2,
    traffic_threshold: float = 0.05,
    choke_m: float = 150.0,
    max_range_m: float = 3000.0,
) -> tuple[np.ndarray, list[dict]]:
    """EA_j = enemy corridor ∩ seen by >= k friendly positions ∩ near an obstacle/choke point.

    Output is a *location proposal* for examination; it contains no fire planning.
    """
    seen = np.zeros(grid.shape, dtype=np.int32)
    for p in friendly_positions:
        seen += viewshed(grid, p, observer_height=2.0, target_height=2.0, max_range_m=max_range_m).visible
    k = min(min_observers, max(len(friendly_positions), 1))
    corridor_mask = ndimage.gaussian_filter(enemy_traffic, 1.0) >= traffic_threshold
    choke = distance_to(enemy_mob.mcoo == NOGO, grid.cell_size) <= choke_m
    ea = corridor_mask & (seen >= k) & choke
    lab, n = ndimage.label(ea, structure=np.ones((3, 3)))
    out = []
    for i in range(1, n + 1):
        m = lab == i
        area = float(m.sum()) * grid.cell_size**2
        if area < 4 * grid.cell_size**2:
            ea[m] = False
            continue
        rr, cc = np.nonzero(m)
        out.append({
            "id": len(out) + 1,
            "centroid": [int(rr.mean()), int(cc.mean())],
            "area_m2": area,
            "observers": int(seen[m].max()),
            "traffic": round(float(enemy_traffic[m].max()), 3),
        })
    out.sort(key=lambda e: -e["traffic"])
    return ea, out


# --------------------------------------------------------------------------- FCOA
def exposure_from_threats(grid: G.TerrainGrid, threats: list[tuple[int, int, float]], max_range_m: float = 4000.0) -> np.ndarray:
    """P(exposed) = 1 - prod(1 - p_k * V_k): a cell is exposed if any probable threat sees it."""
    survive = np.ones(grid.shape)
    for r, c, p in threats:
        vs = viewshed(grid, (r, c), observer_height=1.0, target_height=2.5, max_range_m=max_range_m).visible
        survive *= 1.0 - p * vs
    return 1.0 - survive


def route_exposure(route_cells, exposure: np.ndarray) -> dict:
    if not route_cells:
        return {"mean": 0.0, "max": 0.0, "exposed_fraction": 0.0}
    rr, cc = zip(*route_cells)
    e = exposure[list(rr), list(cc)]
    return {
        "mean": round(float(e.mean()), 3),
        "max": round(float(e.max()), 3),
        "exposed_fraction": round(float((e > 0.3).mean()), 3),
    }


def fcoa_routes(grid: G.TerrainGrid, mob: MobilityResult, start, goal, exposure: np.ndarray, w_threat: float = 8.0) -> list[dict]:
    """Comparison matrix of friendly courses of action: fastest vs. concealed (min sum P(visible))."""
    out = []
    for name, wt in (("מהיר ביותר", 0.0), ("מוסתר / עוקף איום", w_threat)):
        g = build_graph(grid, mob, exposure=exposure, w_threat=wt)
        r = least_cost_path(g, start, goal, grid.cell_size)
        if r is None:
            continue
        d = r.to_dict()
        d["name"] = name
        d["exposure"] = route_exposure(r.cells, exposure)
        out.append(d)
    return out


__all__ = [
    "at_position_likelihood",
    "corridor",
    "enemy_route_density",
    "engagement_area_candidates",
    "exposure_from_threats",
    "fcoa_routes",
    "find_peaks",
    "key_terrain_score",
]
