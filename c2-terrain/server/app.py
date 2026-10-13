"""FastAPI service layer: serves engine products and the offline web client.

Run:  uvicorn server.app:app --port 8800   (from the c2-terrain directory)
"""
from __future__ import annotations

import base64
import os
import threading
import time
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from c2engine import __version__
from c2engine import grid as G
from c2engine import mobility as M
from c2engine import routing as R
from c2engine import threat as T
from c2engine import visibility as V
from c2engine.change import detect_changes, synthetic_pair
from c2engine.sync import OverlayStore, decode_delta, encode_delta
from c2engine.terrain import hillshade, slope_percent

WEB_DIR = Path(__file__).resolve().parent.parent / "web"

Cell = tuple[int, int]

LIMITATIONS = [
    "מודל הגבהים (GLO-30) הוא DSM ברזולוציה של 30 מ': תעלות נ\"ט, חומות, טרסות וערוצים צרים מ-30 מ' אינם נראים בו.",
    "שגיאה אנכית של ~4 מ' (LE90) הופכת לשגיאת שיפוע; לכן NO-GO משיפוע נקבע רק לרצף של 3 תאים לפחות.",
    "בשטח בנוי ומיוער קו הראייה מחושב מול DSM; יש לאמת מול מודל מבנים 2.5D/3D.",
    "שכבות האיום (מארבי נ\"ט, נתיבי אויב, שטחי השמדה) הן הערכה הסתברותית עם משקלות גלויים - לא עובדה.",
    "נתוני קרקע (SoilGrids, 250 מ') גסים מדי לרכב בודד - עבירות קרקע היא סינון ראשוני בלבד.",
]


# --------------------------------------------------------------------------- state
class State:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.grid: G.TerrainGrid | None = None
        self.mob_cache: dict[tuple[str, float], M.MobilityResult] = {}
        self.graph_cache: dict[tuple[str, float], R.GridGraph] = {}
        self.overlays = OverlayStore(node_id=os.environ.get("C2_NODE_ID", "hq"))

    def load(self, grid: G.TerrainGrid) -> None:
        with self.lock:
            self.grid = grid
            self.mob_cache.clear()
            self.graph_cache.clear()

    def g(self) -> G.TerrainGrid:
        if self.grid is None:
            self.load(G.synthetic_scenario(int(os.environ.get("C2_GRID_SIZE", "400"))))
        return self.grid

    def mob(self, vehicle: str, moisture: float) -> M.MobilityResult:
        if vehicle not in M.VEHICLES:
            raise HTTPException(400, f"unknown vehicle {vehicle}")
        key = (vehicle, round(moisture, 2))
        if key not in self.mob_cache:
            self.mob_cache[key] = M.mobility(self.g(), vehicle, moisture)
        return self.mob_cache[key]

    def graph(self, vehicle: str, moisture: float) -> R.GridGraph:
        key = (vehicle, round(moisture, 2))
        if key not in self.graph_cache:
            self.graph_cache[key] = R.build_graph(self.g(), self.mob(vehicle, moisture))
        return self.graph_cache[key]


state = State()
app = FastAPI(title="C2 Terrain & Threat Engine", version=__version__)


# --------------------------------------------------------------------------- encoding
def enc_scalar(a: np.ndarray, lo: float | None = None, hi: float | None = None, nodata: np.ndarray | None = None) -> dict:
    """Quantise a float layer to uint8 (0 = nodata, 1..255 = value)."""
    a = np.asarray(a, dtype=np.float64)
    finite = np.isfinite(a) if nodata is None else (np.isfinite(a) & ~nodata)
    if lo is None:
        lo = float(a[finite].min()) if finite.any() else 0.0
    if hi is None:
        hi = float(a[finite].max()) if finite.any() else 1.0
    span = hi - lo if hi > lo else 1.0
    q = np.zeros(a.shape, dtype=np.uint8)
    q[finite] = (1 + np.clip((a[finite] - lo) / span, 0, 1) * 254).astype(np.uint8)
    return {"kind": "scalar", "min": lo, "max": hi, "data": base64.b64encode(q.tobytes()).decode()}


def enc_class(a: np.ndarray) -> dict:
    return {"kind": "class", "data": base64.b64encode(np.asarray(a, dtype=np.uint8).tobytes()).decode()}


def check_cell(c: Cell) -> Cell:
    g = state.g()
    if not g.in_bounds(c[0], c[1]):
        raise HTTPException(400, f"cell {c} outside grid {g.shape}")
    return (int(c[0]), int(c[1]))


# --------------------------------------------------------------------------- models
class ScenarioReq(BaseModel):
    size: int = Field(400, ge=50, le=1200)
    seed: int = 7


class MobilityReq(BaseModel):
    vehicle: str = "mbt"
    precip_mm_72h: float = Field(0.0, ge=0, le=500)


class ViewshedReq(BaseModel):
    observers: list[Cell]
    observer_height: float = Field(2.0, ge=0, le=500)
    target_height: float = Field(2.0, ge=0, le=100)
    max_range_m: float = Field(5000, gt=0, le=50000)
    mode: str = "binary"  # binary | cumulative | dead_ground | probability
    runs: int = Field(20, ge=2, le=100)


class LinkReq(BaseModel):
    a: Cell
    b: Cell
    h1: float = 2.0
    h2: float = 2.0
    freq_mhz: float = Field(60.0, gt=1, le=10000)
    tx_power_dbm: float = 40.0
    antenna_gain_dbi: float = 2.0
    rx_sensitivity_dbm: float = -110.0


class RouteReq(BaseModel):
    start: Cell
    goal: Cell
    vehicle: str = "mbt"
    precip_mm_72h: float = 0.0
    k: int = Field(3, ge=1, le=5)
    corridor_tolerance: float = Field(0.1, ge=0, le=1)


class ThreatReq(BaseModel):
    friendly_start: Cell
    friendly_goal: Cell
    friendly_vehicle: str = "mbt"
    enemy_starts: list[Cell]
    enemy_objective: Cell
    enemy_vehicle: str = "apc"
    friendly_positions: list[Cell] = []
    tau: float = Field(1.0, gt=0, le=50)
    precip_mm_72h: float = 0.0
    at_weights: dict[str, float] = {}
    kts_weights: dict[str, float] = {}
    beta_observation: float = Field(2.0, ge=0, le=20)
    gamma_concealment: float = Field(0.5, ge=0, le=0.9)


class OverlayPut(BaseModel):
    key: str
    value: dict | None = None


# --------------------------------------------------------------------------- endpoints
@app.get("/api/health")
def health():
    return {"ok": True, "version": __version__}


def scenario_payload() -> dict:
    g = state.g()
    lc_codes = sorted(G.LANDCOVER_NAMES)
    return {
        "name": g.name,
        "rows": g.shape[0],
        "cols": g.shape[1],
        "cell_size": g.cell_size,
        "origin": g.origin,
        "crs": g.crs,
        "vertical_rmse": g.vertical_rmse,
        "vehicles": [v.to_dict() for v in M.VEHICLES.values()],
        "landcover_names": {str(k): G.LANDCOVER_NAMES[k] for k in lc_codes},
        "limitations": LIMITATIONS,
        "layers": {
            "hillshade": enc_scalar(hillshade(g.dsm, g.cell_size), 0, 1),
            "elevation": enc_scalar(g.dtm),
            "slope": enc_scalar(slope_percent(g.dtm, g.cell_size), 0, 60),
            "landcover": enc_class(g.landcover),
            "roads": enc_class(g.roads),
            "dh": enc_scalar(g.dh, 0, 20),
        },
    }


@app.get("/api/scenario")
def get_scenario():
    with state.lock:
        return scenario_payload()


@app.post("/api/scenario")
def new_scenario(req: ScenarioReq):
    with state.lock:
        state.load(G.synthetic_scenario(req.size, seed=req.seed))
        return scenario_payload()


@app.post("/api/mobility")
def mobility(req: MobilityReq):
    with state.lock:
        m = state.mob(req.vehicle, M.soil_moisture_from_precip(req.precip_mm_72h))
        counts = np.bincount(m.mcoo.ravel(), minlength=3) / m.mcoo.size
        return {
            "vehicle": m.vehicle.to_dict(),
            "mcoo": enc_class(m.mcoo),
            "provenance": enc_class(m.provenance),
            "speed": enc_scalar(m.speed_ms * 3.6, 0, max(m.vehicle.v_road_kmh, 1)),
            "rci": enc_scalar(m.rci, 0, 300),
            "fractions": {"go": float(counts[0]), "slow": float(counts[1]), "nogo": float(counts[2])},
            "provenance_names": {str(k): v for k, v in M.PROVENANCE_NAMES.items()},
        }


@app.post("/api/viewshed")
def viewshed(req: ViewshedReq):
    if not req.observers:
        raise HTTPException(400, "at least one observer required")
    obs = [check_cell(o) for o in req.observers]
    kw = dict(observer_height=req.observer_height, target_height=req.target_height, max_range_m=req.max_range_m)
    t0 = time.perf_counter()
    with state.lock:
        g = state.g()
        if req.mode == "cumulative":
            cum = V.cumulative_viewshed(g, obs, **kw)
            layer = enc_scalar(cum, 0, max(len(obs), 1), nodata=cum == 0)
            stats = {"seen_by_any": float((cum > 0).mean())}
        elif req.mode == "dead_ground":
            vs = V.viewshed(g, obs[0], **kw)
            layer = enc_scalar(np.minimum(vs.agl_needed, 30), 0, 30, nodata=~vs.in_range)
            stats = {"dead_fraction": float((vs.in_range & ~vs.visible).sum() / max(vs.in_range.sum(), 1))}
        elif req.mode == "probability":
            p = V.visibility_probability(g, obs[0], runs=req.runs, **kw)
            layer = enc_scalar(p, 0, 1, nodata=p == 0)
            stats = {"certain": float((p > 0.95).mean()), "uncertain": float(((p > 0.05) & (p <= 0.95)).mean())}
        elif req.mode == "binary":
            vs = V.viewshed(g, obs[0], **kw)
            layer = enc_scalar(vs.visible.astype(float), 0, 1, nodata=~vs.visible)
            stats = {"visible_fraction_in_range": float(vs.visible.sum() / max(vs.in_range.sum(), 1))}
        else:
            raise HTTPException(400, "mode must be binary|cumulative|dead_ground|probability")
    stats["elapsed_s"] = round(time.perf_counter() - t0, 3)
    return {"mode": req.mode, "layer": layer, "stats": stats}


@app.post("/api/los")
def los(req: LinkReq):
    with state.lock:
        return V.line_of_sight(state.g(), check_cell(req.a), check_cell(req.b), req.h1, req.h2)


@app.post("/api/radio")
def radio(req: LinkReq):
    a, b = check_cell(req.a), check_cell(req.b)
    if a == b:
        raise HTTPException(400, "endpoints coincide")
    with state.lock:
        return V.radio_link(
            state.g(), a, b, req.freq_mhz, req.h1, req.h2,
            req.tx_power_dbm, req.antenna_gain_dbi, req.rx_sensitivity_dbm,
        )


@app.post("/api/intervisibility")
def intervisibility(points: list[Cell], height: float = 2.0):
    with state.lock:
        m = V.intervisibility_matrix(state.g(), [check_cell(p) for p in points], height)
        return {"matrix": m.astype(int).tolist()}


@app.post("/api/route")
def route(req: RouteReq):
    s, t = check_cell(req.start), check_cell(req.goal)
    t0 = time.perf_counter()
    with state.lock:
        g = state.g()
        moisture = M.soil_moisture_from_precip(req.precip_mm_72h)
        mob = state.mob(req.vehicle, moisture)
        routes = R.k_diverse_paths(g, mob, s, t, k=req.k)
        if not routes:
            raise HTTPException(422, "אין ציר עביר בין הנקודות עבור כלי זה")
        cor = R.corridor(state.graph(req.vehicle, moisture), s, t, req.corridor_tolerance)
        out = []
        for i, r in enumerate(routes):
            d = r.to_dict()
            rr, cc = zip(*r.cells)
            d["name"] = f"ציר {chr(0x05D0 + i)}'"
            d["max_slope_pct"] = round(float(mob.slope_pct[list(rr), list(cc)].max()), 1)
            d["slow_fraction"] = round(float((mob.mcoo[list(rr), list(cc)] == M.SLOW).mean()), 3)
            out.append(d)
    return {
        "routes": out,
        "corridor": enc_class(cor),
        "elapsed_s": round(time.perf_counter() - t0, 3),
    }


@app.post("/api/threat")
def threat(req: ThreatReq):
    """Full ECOA/FCOA pipeline on the current sector."""
    fs, fg = check_cell(req.friendly_start), check_cell(req.friendly_goal)
    es = [check_cell(c) for c in req.enemy_starts] or [fg]
    eo = check_cell(req.enemy_objective)
    fpos = [check_cell(c) for c in req.friendly_positions]
    t0 = time.perf_counter()
    with state.lock:
        g = state.g()
        moisture = M.soil_moisture_from_precip(req.precip_mm_72h)
        fmob = state.mob(req.friendly_vehicle, moisture)
        emob = state.mob(req.enemy_vehicle, moisture)
        fgraph = state.graph(req.friendly_vehicle, moisture)
        axis = R.least_cost_path(fgraph, fs, fg, g.cell_size)
        if axis is None:
            raise HTTPException(422, "אין ציר עביר לכוחותינו")

        # 1. AT / ambush likelihood against our planned axis
        th = T.at_position_likelihood(g, axis.cells, req.at_weights)

        # 2. enemy approach: W = alpha*time + beta*P(friendly observation) - gamma*concealment
        friendly_obs = (
            T.visibility_fraction(g, fpos, height=2.0, target_height=2.0, max_range_m=4000) if fpos else np.zeros(g.shape)
        )
        conceal = np.clip(((g.landcover == G.LC_TREE) | (g.landcover == G.LC_BUILT)).astype(float) * 0.7 + 0.3 * (g.dh > 3), 0, 1)
        egraph = R.build_graph(g, emob, exposure=friendly_obs, w_threat=req.beta_observation, bonus=conceal, w_bonus=req.gamma_concealment)
        traffic = T.enemy_route_density(egraph, es, eo, tau=req.tau)

        # 3. key terrain, engagement-area candidates
        access, _ = R.cost_distance(fgraph, [fs])
        kts, comp = T.key_terrain_score(g, axis.cells, traffic, access, req.kts_weights)
        kts_peaks = T.find_peaks(kts, g.cell_size, min_sep_m=600, top=6, min_value=0.0)
        ea_mask, eas = T.engagement_area_candidates(g, traffic, emob, fpos or [p[:2] for p in kts_peaks[:3]])

        # 4. FCOA: fastest vs concealed against the probable AT positions
        exposure = T.exposure_from_threats(g, th.peaks[:10])
        fcoa = T.fcoa_routes(g, fmob, fs, fg, exposure)
    return {
        "axis": axis.to_dict(),
        "at_probability": enc_scalar(th.probability, 0, 1, nodata=th.probability < 0.02),
        "at_peaks": [{"cell": [r, c], "p": round(p, 3)} for r, c, p in th.peaks],
        "at_weights": th.weights,
        "enemy_traffic": enc_scalar(traffic, 0, max(float(traffic.max()), 1e-6), nodata=traffic <= 0),
        "kts": enc_scalar(kts, 0, 1),
        "kts_peaks": [{"cell": [r, c], "score": round(s, 3)} for r, c, s in kts_peaks],
        "kts_weights": {**T.DEFAULT_KTS_WEIGHTS, **req.kts_weights},
        "engagement_areas": eas,
        "ea_mask": enc_class(ea_mask),
        "exposure": enc_scalar(exposure, 0, 1, nodata=exposure < 0.05),
        "fcoa": fcoa,
        "elapsed_s": round(time.perf_counter() - t0, 2),
        "label": "הערכה הסתברותית - לא עובדה",
    }


@app.post("/api/change/demo")
def change_demo():
    t1, t2, _ = synthetic_pair()
    p, polys = detect_changes(t1, t2)

    def rgb(img):
        return base64.b64encode((np.clip(img[[2, 1, 0]].transpose(1, 2, 0) * 3, 0, 1) * 255).astype(np.uint8).tobytes()).decode()

    return {"rows": p.shape[0], "cols": p.shape[1], "t1": rgb(t1), "t2": rgb(t2), "p": enc_scalar(p, 0, 1), "changes": polys}


# ------------------------------------------------------------------ overlays + delta sync
@app.get("/api/overlays")
def overlays():
    return {"node": state.overlays.node_id, "version": state.overlays.version, "items": state.overlays.items()}


@app.post("/api/overlays")
def put_overlay(req: OverlayPut):
    e = state.overlays.put(req.key, req.value) if req.value is not None else state.overlays.delete(req.key)
    return e.to_dict()


@app.post("/api/sync/delta")
async def sync_delta(request: Request):
    """Peer sends its version vector (JSON); receives a zlib delta of what it lacks."""
    peer_version = await request.json()
    return Response(encode_delta(state.overlays.delta_since(peer_version)), media_type="application/octet-stream")


@app.post("/api/sync/merge")
async def sync_merge(request: Request):
    changed = state.overlays.merge(decode_delta(await request.body()))
    return {"changed": changed, "version": state.overlays.version}


# --------------------------------------------------------------------------- static client
@app.get("/")
def index():
    return FileResponse(WEB_DIR / "index.html")


app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
