"""Least-cost routing on an 8-neighbour grid graph (Dijkstra via scipy.sparse.csgraph).

Edge weight (directed) = travel time across the edge, optionally inflated by an
exposure/threat layer:  w_ij = len_ij * (c_i + c_j)/2 * (1 + w_threat * (e_i + e_j)/2).
For foot movement the time is anisotropic (Tobler, uphill != downhill).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

from .grid import TerrainGrid
from .mobility import MobilityResult, tobler_kmh

DIRS = np.array([(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)])


@dataclass
class GridGraph:
    shape: tuple[int, int]
    matrix: csr_matrix  # directed, weights in seconds (or weighted seconds)
    dir_weights: np.ndarray  # (8, N) weight of edge from node n in direction k (inf if none)
    time_weights: np.ndarray  # (8, N) pure travel time, without threat inflation

    @property
    def n(self) -> int:
        return self.shape[0] * self.shape[1]


def build_graph(
    grid: TerrainGrid,
    mob: MobilityResult,
    exposure: np.ndarray | None = None,
    w_threat: float = 0.0,
    bonus: np.ndarray | None = None,
    w_bonus: float = 0.0,
    extra: np.ndarray | None = None,
) -> GridGraph:
    """Build the routing graph.

    exposure: [0, 1] layer to avoid (e.g. P(observed by enemy)); bonus: [0, 1]
    layer to prefer (e.g. concealment). Multiplier = 1 + w_threat*e - w_bonus*b,
    floored at 0.1 so every edge keeps a positive cost.
    """
    H, W = grid.shape
    N = H * W
    idx = np.arange(N).reshape(H, W)
    cost = mob.cost
    mult = np.ones((H, W))
    if exposure is not None and w_threat:
        mult = mult + w_threat * exposure
    if bonus is not None and w_bonus:
        mult = mult - w_bonus * bonus
    if extra is not None:
        mult = mult + extra
    mult = np.maximum(mult, 0.1)

    dir_w = np.full((8, N), np.inf)
    time_w = np.full((8, N), np.inf)
    rows, cols, data = [], [], []
    foot = mob.vehicle.kind == "foot"
    for k, (dr, dc) in enumerate(DIRS):
        rs = slice(max(0, -dr), H - max(0, dr))
        cs = slice(max(0, -dc), W - max(0, dc))
        rd = slice(max(0, dr), H - max(0, -dr) if dr < 0 else H)
        cd = slice(max(0, dc), W - max(0, -dc) if dc < 0 else W)
        src, dst = idx[rs, cs], idx[rd, cd]
        length = grid.cell_size * (np.sqrt(2) if dr and dc else 1.0)
        if foot:
            dz = grid.dtm[rd, cd] - grid.dtm[rs, cs]
            base_speed = np.where(mob.speed_ms[rs, cs] > 0, mob.speed_ms[rs, cs], 0)
            flat = mob.vehicle.v_offroad_kmh / 3.6
            # replace the isotropic slope factor with directional Tobler
            iso = np.maximum(tobler_kmh(np.abs(dz) / length) / 6.0 * np.exp(0.175), 1e-6)
            aniso = tobler_kmh(dz / length) / 6.0 * np.exp(0.175)
            speed = np.minimum(base_speed * aniso / iso, flat * 1.2)
            with np.errstate(divide="ignore"):
                t = np.where((speed > 0.05) & np.isfinite(cost[rd, cd]), length / speed, np.inf)
        else:
            t = length * 0.5 * (cost[rs, cs] + cost[rd, cd])
        wgt = t * 0.5 * (mult[rs, cs] + mult[rd, cd])
        time_w[k, src.ravel()] = t.ravel()
        dir_w[k, src.ravel()] = wgt.ravel()
        ok = np.isfinite(wgt).ravel()
        rows.append(src.ravel()[ok])
        cols.append(dst.ravel()[ok])
        data.append(wgt.ravel()[ok])
    m = csr_matrix((np.concatenate(data), (np.concatenate(rows), np.concatenate(cols))), shape=(N, N))
    return GridGraph((H, W), m, dir_w, time_w)


def cost_distance(g: GridGraph, sources, reverse: bool = False) -> tuple[np.ndarray, np.ndarray]:
    """Accumulated cost from sources (or *to* sources when reverse=True). Returns (dist, predecessors)."""
    W = g.shape[1]
    src = [r * W + c for r, c in sources]
    mat = g.matrix.T.tocsr() if reverse else g.matrix
    dist, pred, _ = dijkstra(mat, directed=True, indices=src, return_predecessors=True, min_only=True)
    return dist.reshape(g.shape), pred


def _walk(pred: np.ndarray, target: int) -> list[int]:
    path = [target]
    while pred[path[-1]] >= 0:
        path.append(int(pred[path[-1]]))
    return path[::-1]


@dataclass
class Route:
    cells: list[tuple[int, int]]
    cost: float  # weighted cost
    time_s: float  # pure travel time
    length_m: float

    def to_dict(self) -> dict:
        return {
            "cells": [list(c) for c in self.cells],
            "cost": round(self.cost, 1),
            "time_min": round(self.time_s / 60, 1),
            "length_km": round(self.length_m / 1000, 2),
        }


def _route_from_nodes(g: GridGraph, nodes: list[int], cell: float) -> Route:
    W = g.shape[1]
    cells = [(n // W, n % W) for n in nodes]
    cost = time = length = 0.0
    for a, b in zip(nodes[:-1], nodes[1:]):
        dr, dc = b // W - a // W, b % W - a % W
        k = int(np.nonzero((DIRS[:, 0] == dr) & (DIRS[:, 1] == dc))[0][0])
        cost += g.dir_weights[k, a]
        time += g.time_weights[k, a]
        length += cell * (np.sqrt(2) if dr and dc else 1.0)
    return Route(cells, float(cost), float(time), float(length))


def least_cost_path(g: GridGraph, start, goal, cell: float) -> Route | None:
    W = g.shape[1]
    s, t = start[0] * W + start[1], goal[0] * W + goal[1]
    dist, pred = dijkstra(g.matrix, directed=True, indices=s, return_predecessors=True)
    if not np.isfinite(dist[t]):
        return None
    return _route_from_nodes(g, _walk(pred, t), cell)


def k_diverse_paths(
    grid: TerrainGrid,
    mob: MobilityResult,
    start,
    goal,
    k: int = 3,
    penalty: float = 4.0,
    buffer_m: float = 150.0,
    **graph_kw,
) -> list[Route]:
    """k spatially distinct routes: after each route, inflate the cost in a buffer around it."""
    routes: list[Route] = []
    pen = np.zeros(grid.shape)
    base = build_graph(grid, mob, **graph_kw)
    for _ in range(k):
        g = build_graph(grid, mob, extra=penalty * pen, **graph_kw) if routes else base
        r = least_cost_path(g, start, goal, grid.cell_size)
        if r is None:
            break
        if routes:  # report cost/time without the diversity penalty
            W = grid.shape[1]
            r = _route_from_nodes(base, [a * W + b for a, b in r.cells], grid.cell_size)
        routes.append(r)
        mask = np.zeros(grid.shape, dtype=bool)
        rr, cc = zip(*r.cells)
        mask[list(rr), list(cc)] = True
        pen = np.maximum(pen, ndimage.distance_transform_edt(~mask) * grid.cell_size <= buffer_m)
    return routes


def corridor(g: GridGraph, start, goal, tolerance: float = 0.1) -> np.ndarray:
    """Mobility corridor: cells with CD_A + CD_B <= min * (1 + tolerance)."""
    da, _ = cost_distance(g, [start])
    db, _ = cost_distance(g, [goal], reverse=True)
    total = da + db
    best = np.nanmin(np.where(np.isfinite(total), total, np.nan))
    if not np.isfinite(best):
        return np.zeros(g.shape, dtype=bool)
    return total <= best * (1 + tolerance)
