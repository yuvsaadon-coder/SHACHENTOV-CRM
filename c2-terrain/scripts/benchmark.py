"""Measure the technical KPIs from the spec on the local machine.

    python scripts/benchmark.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from c2engine import mobility as M  # noqa: E402
from c2engine import routing as R  # noqa: E402
from c2engine import threat as T  # noqa: E402
from c2engine.grid import synthetic_scenario  # noqa: E402
from c2engine.visibility import viewshed  # noqa: E402


def timed(label, fn, target=None):
    t = time.perf_counter()
    out = fn()
    dt = time.perf_counter() - t
    verdict = "" if target is None else ("  ✔" if dt <= target else "  ✘") + f" (target {target}s)"
    print(f"{label:<55} {dt:7.2f}s{verdict}")
    return out


if __name__ == "__main__":
    big = synthetic_scenario(1000)  # 10 km x 10 km @ 10 m
    timed("Viewshed 10x10 km @10 m, observer at centre", lambda: viewshed(big, (500, 500), max_range_m=7100), 1.5)
    timed("MCOO tank, 10x10 km", lambda: M.mobility(big, "mbt"))

    g = synthetic_scenario(400)
    mob = M.mobility(g, "mbt")
    gr = timed("Routing graph 4x4 km (8-neighbour)", lambda: R.build_graph(g, mob))
    timed("3 diverse routes", lambda: R.k_diverse_paths(g, mob, (380, 20), (30, 370), k=3))

    def ecoa():
        axis = R.least_cost_path(gr, (380, 20), (60, 320), g.cell_size)
        th = T.at_position_likelihood(g, axis.cells)
        traffic = T.enemy_route_density(gr, [(20, 380)], (350, 60))
        access, _ = R.cost_distance(gr, [(380, 20)])
        T.key_terrain_score(g, axis.cells, traffic, access)
        exp = T.exposure_from_threats(g, th.peaks[:10])
        T.fcoa_routes(g, mob, (380, 20), (60, 320), exp)

    timed("Full ECOA/FCOA pipeline 4x4 km", ecoa, 180)
