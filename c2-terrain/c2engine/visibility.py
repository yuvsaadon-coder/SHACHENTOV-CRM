"""Line of sight, viewshed, dead ground, intervisibility and RF (Fresnel) analysis.

All results are deterministic geometry. Observers stand on the bare-earth DTM;
obstructions are taken from the DSM (buildings, canopy). Earth curvature and
refraction are applied as z_adj = z - cc * d^2 / (2 * R_e), where
cc = 1 - refraction. cc = 0.85714 (refraction 1/7) is GDAL's default for
optical sight; cc = 0.75 (k = 4/3 effective earth) is the radio convention.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage

from .grid import TerrainGrid

EARTH_RADIUS = 6_371_000.0
CC_OPTICAL = 0.85714
CC_RADIO = 0.75  # = 1 / (4/3)
C_LIGHT = 299_792_458.0


def curvature_drop(d: np.ndarray | float, cc: float = CC_OPTICAL):
    return cc * np.asarray(d, dtype=np.float64) ** 2 / (2.0 * EARTH_RADIUS)


@dataclass
class ViewshedResult:
    visible: np.ndarray  # bool: target at target_height is visible
    agl_needed: np.ndarray  # metres above ground a target must rise to be seen (dead-ground depth)
    in_range: np.ndarray  # bool: within max range (cells outside are not analysed)


def viewshed(
    grid: TerrainGrid,
    observer: tuple[int, int],
    observer_height: float = 2.0,
    target_height: float = 0.0,
    max_range_m: float = 5000.0,
    cc: float = CC_OPTICAL,
    surface: np.ndarray | None = None,
) -> ViewshedResult:
    """Radial ray-sweep viewshed (R3-style rays to every cell of the range perimeter).

    Every cell inside the range square is sampled by at least one ray stepping one
    cell along the major axis (DDA / Bresenham-like). A cell is visible when its
    elevation angle is not below the running horizon of all nearer samples.
    """
    surf = grid.dsm if surface is None else surface
    ground = grid.dtm if surface is None else surface
    H, W = grid.shape
    r0, c0 = observer
    if not grid.in_bounds(r0, c0):
        raise ValueError("observer outside grid")
    R = int(np.ceil(max_range_m / grid.cell_size))
    rmin, rmax = max(0, r0 - R), min(H - 1, r0 + R)
    cmin, cmax = max(0, c0 - R), min(W - 1, c0 + R)

    # perimeter of the clipped analysis window
    top = [(rmin, c) for c in range(cmin, cmax + 1)]
    bottom = [(rmax, c) for c in range(cmin, cmax + 1)]
    left = [(r, cmin) for r in range(rmin + 1, rmax)]
    right = [(r, cmax) for r in range(rmin + 1, rmax)]
    per = np.array(top + bottom + left + right, dtype=np.int64)
    dr = per[:, 0] - r0
    dc = per[:, 1] - c0
    L = np.maximum(np.abs(dr), np.abs(dc))
    keep = L > 0
    dr, dc, L = dr[keep], dc[keep], L[keep]
    if L.size == 0:
        vis = np.zeros(grid.shape, dtype=bool)
        vis[r0, c0] = True
        return ViewshedResult(vis, np.zeros(grid.shape), vis.copy())

    Lmax = int(L.max())
    k = np.arange(1, Lmax + 1, dtype=np.float64)[None, :]
    t = k / L[:, None]
    valid = t <= 1.0 + 1e-12
    t = np.minimum(t, 1.0)
    rr = np.rint(r0 + dr[:, None] * t).astype(np.int64)
    cc_ = np.rint(c0 + dc[:, None] * t).astype(np.int64)
    d = grid.cell_size * np.hypot(rr - r0, cc_ - c0)
    d = np.where(d == 0, grid.cell_size * 0.5, d)
    valid &= d <= max_range_m

    drop = curvature_drop(d, cc)
    obs_z = ground[r0, c0] + observer_height
    obstruction = (surf[rr, cc_] - drop - obs_z) / d
    obstruction = np.where(valid, obstruction, -np.inf)
    horizon = np.maximum.accumulate(obstruction, axis=1)
    # horizon seen *before* reaching sample k (exclusive running max)
    prev = np.concatenate([np.full((horizon.shape[0], 1), -np.inf), horizon[:, :-1]], axis=1)
    tgt_base = ground[rr, cc_] - drop
    tgt_angle = (tgt_base + target_height - obs_z) / d
    vis_s = (tgt_angle >= prev) & valid
    agl_s = np.where(np.isfinite(prev), np.maximum(0.0, prev * d + obs_z - tgt_base), 0.0)

    flat = (rr * W + cc_)[valid]
    visible = np.zeros(H * W, dtype=np.uint8)
    np.maximum.at(visible, flat, vis_s[valid].astype(np.uint8))
    agl = np.full(H * W, np.inf)
    np.minimum.at(agl, flat, agl_s[valid])
    in_range = np.zeros(H * W, dtype=bool)
    in_range[flat] = True

    visible = visible.reshape(H, W).astype(bool)
    visible[r0, c0] = True
    in_range = in_range.reshape(H, W)
    in_range[r0, c0] = True
    agl = agl.reshape(H, W)
    agl[r0, c0] = 0.0
    agl[~in_range] = np.nan
    return ViewshedResult(visible, agl, in_range)


def cumulative_viewshed(grid: TerrainGrid, observers, **kw) -> np.ndarray:
    """S(x, y) = sum_k V(o_k, (x, y)): number of observers seeing each cell."""
    total = np.zeros(grid.shape, dtype=np.int32)
    for o in observers:
        total += viewshed(grid, (o[0], o[1]), **kw).visible
    return total


def visibility_probability(
    grid: TerrainGrid,
    observer: tuple[int, int],
    runs: int = 30,
    correlation_m: float = 60.0,
    seed: int = 0,
    **kw,
) -> np.ndarray:
    """Monte Carlo P(visible) under spatially correlated DEM error (sigma = grid.vertical_rmse)."""
    rng = np.random.default_rng(seed)
    sigma_cells = max(correlation_m / grid.cell_size, 0.5)
    acc = np.zeros(grid.shape, dtype=np.float64)
    base_dtm, base_dsm = grid.dtm, grid.dsm
    try:
        for _ in range(runs):
            noise = ndimage.gaussian_filter(rng.standard_normal(grid.shape), sigma_cells)
            sd = noise.std()
            noise = noise / sd * grid.vertical_rmse if sd > 0 else noise
            grid.dtm, grid.dsm = base_dtm + noise, base_dsm + noise
            acc += viewshed(grid, observer, **kw).visible
    finally:
        grid.dtm, grid.dsm = base_dtm, base_dsm
    return acc / runs


@dataclass
class Profile:
    distance: np.ndarray  # [m] from p1
    ground: np.ndarray  # DTM
    surface: np.ndarray  # DSM
    cells: np.ndarray  # (n, 2) row/col


def profile(grid: TerrainGrid, p1: tuple[int, int], p2: tuple[int, int], step_cells: float = 0.5) -> Profile:
    (r1, c1), (r2, c2) = p1, p2
    n = max(2, int(np.ceil(np.hypot(r2 - r1, c2 - c1) / step_cells)) + 1)
    t = np.linspace(0, 1, n)
    rr = np.clip(np.rint(r1 + (r2 - r1) * t).astype(int), 0, grid.shape[0] - 1)
    cc = np.clip(np.rint(c1 + (c2 - c1) * t).astype(int), 0, grid.shape[1] - 1)
    dist = t * grid.cell_size * np.hypot(r2 - r1, c2 - c1)
    return Profile(dist, grid.dtm[rr, cc], grid.dsm[rr, cc], np.stack([rr, cc], 1))


def line_of_sight(
    grid: TerrainGrid,
    p1: tuple[int, int],
    p2: tuple[int, int],
    h1: float = 2.0,
    h2: float = 2.0,
    cc: float = CC_OPTICAL,
) -> dict:
    """Binary V(p1, p2) with the first obstruction point."""
    pr = profile(grid, p1, p2)
    D = pr.distance[-1]
    z1 = pr.ground[0] + h1
    z2 = pr.ground[-1] + h2 - curvature_drop(D, cc)
    line = z1 + (z2 - z1) * (pr.distance / D if D > 0 else 0)
    obst = pr.surface - curvature_drop(pr.distance, cc)
    interior = slice(1, -1)
    clearance = line[interior] - obst[interior]
    blocked_idx = np.nonzero(clearance < 0)[0]
    out = {
        "visible": bool(blocked_idx.size == 0),
        "distance_m": float(D),
        "min_clearance_m": float(clearance.min()) if clearance.size else float("inf"),
        "profile": {
            "distance": pr.distance.round(1).tolist(),
            "ground": pr.ground.round(1).tolist(),
            "surface": pr.surface.round(1).tolist(),
            "los": line.round(1).tolist(),
        },
    }
    if blocked_idx.size:
        i = int(blocked_idx[0]) + 1
        out["first_obstruction"] = {"cell": pr.cells[i].tolist(), "distance_m": float(pr.distance[i])}
    return out


def intervisibility_matrix(grid: TerrainGrid, points, height: float = 2.0) -> np.ndarray:
    n = len(points)
    m = np.eye(n, dtype=bool)
    for i in range(n):
        for j in range(i + 1, n):
            m[i, j] = m[j, i] = line_of_sight(grid, points[i], points[j], height, height)["visible"]
    return m


def knife_edge_loss_db(v: float) -> float:
    """ITU-R P.526 single knife-edge approximation J(v)."""
    if v <= -0.78:
        return 0.0
    return 6.9 + 20 * np.log10(np.sqrt((v - 0.1) ** 2 + 1) + v - 0.1)


def radio_link(
    grid: TerrainGrid,
    p1: tuple[int, int],
    p2: tuple[int, int],
    freq_mhz: float = 60.0,
    h1: float = 3.0,
    h2: float = 3.0,
    tx_power_dbm: float = 40.0,
    antenna_gain_dbi: float = 2.0,
    rx_sensitivity_dbm: float = -110.0,
) -> dict:
    """RF line of sight with first-Fresnel-zone clearance and knife-edge diffraction.

    Clear when every obstruction leaves >= 0.6 r_F1 clearance (<= 40% intrusion).
    Path loss = free space + worst single knife edge (Bullington-style main edge).
    This is an engineering screen, not a replacement for ITM/Longley-Rice.
    """
    pr = profile(grid, p1, p2)
    D = float(pr.distance[-1])
    if D <= 0:
        raise ValueError("endpoints coincide")
    lam = C_LIGHT / (freq_mhz * 1e6)
    z1 = pr.ground[0] + h1
    z2 = pr.ground[-1] + h2
    d1 = pr.distance[1:-1]
    d2 = D - d1
    line = z1 + (z2 - z1) * d1 / D
    # obstruction relative to the chord, earth bulge for k = 4/3
    bulge = CC_RADIO * d1 * d2 / (2 * EARTH_RADIUS)
    obst = pr.surface[1:-1] + bulge
    clearance = line - obst
    r_f1 = np.sqrt(lam * d1 * d2 / D)
    ratio = clearance / np.maximum(r_f1, 1e-9)
    i = int(np.argmin(ratio)) if ratio.size else 0
    min_ratio = float(ratio[i]) if ratio.size else float("inf")
    v_all = -clearance * np.sqrt(2 * D / (lam * d1 * d2))
    v = float(v_all.max()) if v_all.size else -10.0
    diffraction = knife_edge_loss_db(v)
    fspl = 20 * np.log10(D / 1000) + 20 * np.log10(freq_mhz) + 32.44
    path_loss = fspl + diffraction
    rx = tx_power_dbm + 2 * antenna_gain_dbi - path_loss
    if min_ratio >= 0.6:
        status = "clear"
    elif min_ratio >= 0:
        status = "fresnel_obstructed"
    else:
        status = "blocked"
    return {
        "status": status,
        "distance_m": D,
        "frequency_mhz": freq_mhz,
        "min_fresnel_clearance_ratio": round(min_ratio, 3),
        "critical_point_distance_m": float(d1[i]) if d1.size else 0.0,
        "fspl_db": round(float(fspl), 1),
        "diffraction_loss_db": round(float(diffraction), 1),
        "path_loss_db": round(float(path_loss), 1),
        "rx_level_dbm": round(float(rx), 1),
        "link_margin_db": round(float(rx - rx_sensitivity_dbm), 1),
        "link_ok": bool(rx >= rx_sensitivity_dbm),
        "profile": {
            "distance": pr.distance.round(1).tolist(),
            "surface": pr.surface.round(1).tolist(),
            "los": np.concatenate([[z1], line, [z2]]).round(1).tolist(),
            "fresnel_06": np.concatenate([[z1], line - 0.6 * r_f1, [z2]]).round(1).tolist(),
        },
    }
