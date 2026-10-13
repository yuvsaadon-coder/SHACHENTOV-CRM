"""Deterministic terrain derivatives: slope, aspect, hillshade, TPI, depression fill."""
from __future__ import annotations

import heapq

import numpy as np
from scipy import ndimage


def gradient(z: np.ndarray, cell: float) -> tuple[np.ndarray, np.ndarray]:
    """Horn's 3x3 gradient (as gdaldem). Returns (dz/dx east, dz/dy north)."""
    p = np.pad(z, 1, mode="edge")
    a, b, c = p[:-2, :-2], p[:-2, 1:-1], p[:-2, 2:]
    d, f = p[1:-1, :-2], p[1:-1, 2:]
    g, h, i = p[2:, :-2], p[2:, 1:-1], p[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * cell)
    dzdy = ((a + 2 * b + c) - (g + 2 * h + i)) / (8 * cell)  # row 0 is north
    return dzdx, dzdy


def slope_percent(z: np.ndarray, cell: float) -> np.ndarray:
    dzdx, dzdy = gradient(z, cell)
    return 100.0 * np.hypot(dzdx, dzdy)


def slope_degrees(z: np.ndarray, cell: float) -> np.ndarray:
    return np.degrees(np.arctan(slope_percent(z, cell) / 100.0))


def aspect_degrees(z: np.ndarray, cell: float) -> np.ndarray:
    """Downslope direction, clockwise from north."""
    dzdx, dzdy = gradient(z, cell)
    return (np.degrees(np.arctan2(-dzdx, -dzdy)) + 360.0) % 360.0


def hillshade(z: np.ndarray, cell: float, azimuth: float = 315.0, altitude: float = 45.0) -> np.ndarray:
    dzdx, dzdy = gradient(z, cell)
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(-dzdx, -dzdy)
    az, alt = np.radians(azimuth), np.radians(altitude)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(shade, 0, 1)


def tpi(z: np.ndarray, cell: float, radius_m: float = 500.0) -> np.ndarray:
    """Topographic Position Index: z0 - mean(z) in a square window of the given radius."""
    k = max(3, int(2 * radius_m / cell) | 1)
    return z - ndimage.uniform_filter(z, size=k, mode="nearest")


def normalize(a: np.ndarray, lo_pct: float = 2, hi_pct: float = 98) -> np.ndarray:
    lo, hi = np.percentile(a, [lo_pct, hi_pct])
    if hi - lo < 1e-9:
        return np.zeros_like(a, dtype=np.float64)
    return np.clip((a - lo) / (hi - lo), 0, 1)


def fill_depressions(z: np.ndarray, epsilon: float = 0.0) -> np.ndarray:
    """Priority-flood depression filling (Wang & Liu 2006 / Barnes 2014).

    Cells are flooded inwards from the edge in elevation order; any cell lower
    than its spill point is raised to it.
    """
    h, w = z.shape
    out = z.astype(np.float64).copy()
    closed = np.zeros((h, w), dtype=bool)
    heap: list[tuple[float, int, int]] = []
    for r in range(h):
        for c in (0, w - 1):
            heapq.heappush(heap, (out[r, c], r, c))
            closed[r, c] = True
    for c in range(1, w - 1):
        for r in (0, h - 1):
            heapq.heappush(heap, (out[r, c], r, c))
            closed[r, c] = True
    nbrs = ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1))
    while heap:
        zc, r, c = heapq.heappop(heap)
        for dr, dc in nbrs:
            rr, cc = r + dr, c + dc
            if 0 <= rr < h and 0 <= cc < w and not closed[rr, cc]:
                closed[rr, cc] = True
                if out[rr, cc] <= zc:
                    out[rr, cc] = zc + epsilon
                heapq.heappush(heap, (out[rr, cc], rr, cc))
    return out


def crest_lines(z: np.ndarray, cell: float, radius_m: float = 300.0, min_tpi: float = 8.0) -> np.ndarray:
    """Tactical crest approximation: local maxima along at least one axis with positive TPI."""
    t = tpi(z, cell, radius_m)
    zs = ndimage.gaussian_filter(z, 1.5)
    ns = (zs >= np.roll(zs, 1, 0)) & (zs >= np.roll(zs, -1, 0))
    ew = (zs >= np.roll(zs, 1, 1)) & (zs >= np.roll(zs, -1, 1))
    crest = (ns | ew) & (t > min_tpi)
    crest[[0, -1], :] = False
    crest[:, [0, -1]] = False
    return crest


def distance_to(mask: np.ndarray, cell: float) -> np.ndarray:
    """Euclidean distance [m] from each cell to the nearest True cell of mask."""
    if not mask.any():
        return np.full(mask.shape, np.inf)
    return ndimage.distance_transform_edt(~mask) * cell
