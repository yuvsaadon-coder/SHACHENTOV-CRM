"""Trafficability: WES-style soil strength (RCI vs VCI), slope/land-cover speed models and MCOO.

speed_i = v_max * f_slope * f_LC * f_soil   (off road)
speed_i = v_road * f_slope                    (on road)
cost_i  = 1 / speed_i [s/m]; cost_i = inf for NO-GO.

All thresholds and coefficients are open, documented defaults (FM 5-33,
ATP 3-21.8, WES mobility index) and are meant to be calibrated per force.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
from scipy import ndimage

from . import grid as G
from .terrain import slope_percent

GO, SLOW, NOGO = 0, 1, 2
CLASS_NAMES = {GO: "Unrestricted (GO)", SLOW: "Restricted (SLOW GO)", NOGO: "Severely Restricted (NO GO)"}

# provenance bits: why a cell was restricted
P_SLOPE, P_WATER, P_FOREST, P_URBAN, P_SOIL = 1, 2, 4, 8, 16
PROVENANCE_NAMES = {P_SLOPE: "שיפוע", P_WATER: "מים", P_FOREST: "יער", P_URBAN: "בינוי", P_SOIL: "קרקע (RCI)"}


# --------------------------------------------------------------------------- WES mobility index
def tracked_mobility_index(
    weight_t: float,
    track_width_m: float,
    track_contact_length_m: float,
    road_wheels: int,
    shoe_length_m: float,
    clearance_m: float,
    hp_per_ton: float,
    grouser_m: float = 0.04,
    hydraulic_transmission: bool = True,
) -> float:
    """WES Mobility Index for tracked vehicles (imperial units internally)."""
    lb = weight_t * 2204.62
    width_in = track_width_m * 39.37
    contact_in2 = 2 * width_in * track_contact_length_m * 39.37
    cpf = lb / contact_in2
    kips = lb / 1000
    wf = 1.0 if kips < 50 else 1.2 if kips < 70 else 1.4 if kips < 100 else 1.8
    tf = width_in / 100
    gf = 1.1 if grouser_m * 39.37 >= 1.5 else 1.0
    bf = (lb / 10) / (road_wheels * width_in * shoe_length_m * 39.37)
    cf = clearance_m * 39.37 / 10
    ef = 1.0 if hp_per_ton >= 10 else 1.05
    trf = 1.0 if hydraulic_transmission else 1.05
    return (cpf * wf / (tf * gf) + bf - cf) * ef * trf


def wheeled_mobility_index(
    weight_t: float,
    tires: int,
    axles: int,
    tire_width_m: float,
    rim_diameter_m: float,
    clearance_m: float,
    hp_per_ton: float,
    chains: bool = False,
    hydraulic_transmission: bool = True,
) -> float:
    """WES Mobility Index for wheeled vehicles (simplified weight factor)."""
    lb = weight_t * 2204.62
    tw_in = tire_width_m * 39.37
    cpf = lb / (tires * tw_in * rim_diameter_m * 39.37 / 2)
    tyf = (10 + tw_in) / 100
    grf = 1.05 if chains else 1.0
    wlf = (lb / 1000) / axles
    clf = clearance_m * 39.37 / 10
    ef = 1.0 if hp_per_ton >= 10 else 1.05
    trf = 1.0 if hydraulic_transmission else 1.05
    return (cpf / (tyf * grf) + wlf - clf) * ef * trf


def vci_tracked(mi: float) -> tuple[float, float]:
    vci1 = 7.0 + 0.2 * mi - 39.2 / (mi + 5.6)
    vci50 = 19.27 + 0.43 * mi - 125.79 / (mi + 7.08)
    return vci1, vci50


def vci_wheeled(mi: float) -> tuple[float, float]:
    vci1 = 11.48 + 0.2 * mi - 39.2 / (mi + 3.74)
    vci50 = 28.23 + 0.43 * mi - 92.67 / (mi + 3.67)
    return vci1, vci50


# --------------------------------------------------------------------------- vehicle profiles
@dataclass
class Vehicle:
    key: str
    name: str
    kind: str  # foot | wheeled | tracked
    v_offroad_kmh: float
    v_road_kmh: float
    slope_slow_pct: float
    slope_nogo_pct: float
    vci1: float
    vci50: float
    forest_factor: float  # speed factor in tree cover (dh <= forest_nogo_dh)
    forest_nogo_dh: float  # canopy height above which the cover is impassable
    mi: float | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def _tracked(key, name, **spec) -> Vehicle:
    v = spec.pop("v"), spec.pop("v_road")
    mi = tracked_mobility_index(**spec)
    vci1, vci50 = vci_tracked(mi)
    return Vehicle(key, name, "tracked", v[0], v[1], 30, 45, vci1, vci50, 0.3, 1e9, round(mi, 1))


def _wheeled(key, name, **spec) -> Vehicle:
    v = spec.pop("v"), spec.pop("v_road")
    mi = wheeled_mobility_index(**spec)
    vci1, vci50 = vci_wheeled(mi)
    return Vehicle(key, name, "wheeled", v[0], v[1], 15, 30, vci1, vci50, 0.4, 8.0, round(mi, 1))


VEHICLES: dict[str, Vehicle] = {
    v.key: v
    for v in (
        Vehicle("foot", "רגלי (לוחם בעומס)", "foot", 5.0, 5.5, 40, 70, 10.0, 20.0, 0.7, 1e9),
        _tracked(
            "mbt", "טנק מערכה (~65 ט')", v=30, v_road=55, weight_t=65, track_width_m=0.66,
            track_contact_length_m=4.6, road_wheels=12, shoe_length_m=0.18, clearance_m=0.5, hp_per_ton=23,
        ),
        _tracked(
            "apc", "נגמ\"ש זחלי (~13 ט')", v=35, v_road=60, weight_t=13, track_width_m=0.38,
            track_contact_length_m=2.7, road_wheels=10, shoe_length_m=0.15, clearance_m=0.43, hp_per_ton=16,
        ),
        _wheeled(
            "apc8x8", "נגמ\"ש אופני 8x8 (~35 ט')", v=40, v_road=90, weight_t=35, tires=8, axles=4,
            tire_width_m=0.4, rim_diameter_m=0.56, clearance_m=0.5, hp_per_ton=21,
        ),
        _wheeled(
            "jeep", "רכב קל 4x4", v=40, v_road=80, weight_t=3.5, tires=4, axles=2,
            tire_width_m=0.3, rim_diameter_m=0.43, clearance_m=0.4, hp_per_ton=40,
        ),
    )
}


# --------------------------------------------------------------------------- soil strength
# Cone index (dry, wet) and remolding index per soil class; RCI = CI * RI
SOIL_CI = {
    G.SOIL_GRAVEL: (300.0, 280.0, 1.0),
    G.SOIL_SAND: (140.0, 180.0, 0.9),
    G.SOIL_SILT: (250.0, 60.0, 0.6),
    G.SOIL_CLAY: (300.0, 50.0, 0.7),
    G.SOIL_FAT_CLAY: (250.0, 30.0, 0.5),
}


def soil_moisture_from_precip(precip_mm_72h: float, base: float = 0.15) -> float:
    """Crude wetness index in [0, 1] from 72h accumulated precipitation (ERA5/Open-Meteo)."""
    return float(np.clip(base + precip_mm_72h / 50.0, 0.0, 1.0))


def rci(soil: np.ndarray, moisture: float) -> np.ndarray:
    out = np.zeros(soil.shape, dtype=np.float64)
    for cls, (dry, wet, ri) in SOIL_CI.items():
        m = soil == cls
        out[m] = (dry * (1 - moisture) + wet * moisture) * ri
    return out


def soil_passability(rci_map: np.ndarray, v: Vehicle) -> tuple[np.ndarray, np.ndarray]:
    """GO if RCI >= VCI50, SLOW if VCI1 <= RCI < VCI50, NO-GO below VCI1. Returns (class, speed factor)."""
    cls = np.full(rci_map.shape, GO, dtype=np.uint8)
    cls[rci_map < v.vci50] = SLOW
    cls[rci_map < v.vci1] = NOGO
    f = np.ones(rci_map.shape)
    slow = cls == SLOW
    f[slow] = 0.4 + 0.6 * (rci_map[slow] - v.vci1) / max(v.vci50 - v.vci1, 1e-6)
    f[cls == NOGO] = 0.0
    return cls, f


# --------------------------------------------------------------------------- speed models
def tobler_kmh(slope_tan: np.ndarray) -> np.ndarray:
    """Tobler hiking function W = 6 exp(-3.5 |tan(theta) + 0.05|) [km/h], directional."""
    return 6.0 * np.exp(-3.5 * np.abs(slope_tan + 0.05))


def vehicle_slope_factor(slope_pct: np.ndarray, v: Vehicle) -> np.ndarray:
    """Quadratic degradation V = V_base * max(0, 1 - (tan/tan_max)^2), tan_max = NO-GO slope."""
    return np.clip(1.0 - (slope_pct / v.slope_nogo_pct) ** 2, 0.0, 1.0)


def landcover_factor(g: G.TerrainGrid, v: Vehicle) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Returns (speed factor, nogo mask, provenance bits)."""
    lc, dh = g.landcover, g.dh
    f = np.ones(g.shape)
    nogo = np.zeros(g.shape, dtype=bool)
    prov = np.zeros(g.shape, dtype=np.uint8)
    table = {
        "foot": {G.LC_SHRUB: 0.8, G.LC_CROP: 0.85, G.LC_BUILT: 0.6, G.LC_BARE: 1.0},
        "wheeled": {G.LC_SHRUB: 0.6, G.LC_CROP: 0.7, G.LC_BARE: 0.9},
        "tracked": {G.LC_SHRUB: 0.75, G.LC_CROP: 0.8, G.LC_BARE: 0.95},
    }[v.kind]
    for cls, val in table.items():
        f[lc == cls] = val
    tree = lc == G.LC_TREE
    f[tree] = v.forest_factor
    prov[tree] |= P_FOREST
    nogo |= tree & (dh > v.forest_nogo_dh)
    water = lc == G.LC_WATER
    nogo |= water
    prov[water] |= P_WATER
    built = lc == G.LC_BUILT
    prov[built] |= P_URBAN
    if v.kind != "foot":
        nogo |= built & (dh > 2.0)  # buildings block vehicles; streets are roads
    else:
        f[built & (dh > 2.0)] = 0.3
    return f, nogo, prov


@dataclass
class MobilityResult:
    vehicle: Vehicle
    speed_ms: np.ndarray  # isotropic speed [m/s], 0 for NO-GO
    cost: np.ndarray  # [s/m], inf for NO-GO
    mcoo: np.ndarray  # GO / SLOW / NOGO
    provenance: np.ndarray  # bitmask
    rci: np.ndarray
    slope_pct: np.ndarray


def mobility(
    g: G.TerrainGrid,
    vehicle: str | Vehicle = "mbt",
    moisture: float = 0.2,
    min_nogo_cells: int = 3,
) -> MobilityResult:
    v = VEHICLES[vehicle] if isinstance(vehicle, str) else vehicle
    slope = slope_percent(g.dtm, g.cell_size)
    prov = np.zeros(g.shape, dtype=np.uint8)

    # slope: NO-GO only where it is spatially consistent (>= min_nogo_cells contiguous),
    # because single-pixel slope on a 30 m DEM is dominated by vertical error
    slope_nogo = slope > v.slope_nogo_pct
    if min_nogo_cells > 1 and slope_nogo.any():
        lab, n = ndimage.label(slope_nogo, structure=np.ones((3, 3)))
        sizes = ndimage.sum(slope_nogo, lab, index=np.arange(1, n + 1))
        small = np.isin(lab, np.nonzero(sizes < min_nogo_cells)[0] + 1)
        slope_nogo &= ~small
    slope_slow = slope > v.slope_slow_pct
    prov[slope_slow] |= P_SLOPE

    if v.kind == "foot":
        f_slope = tobler_kmh(slope / 100.0) / 6.0 * np.exp(3.5 * 0.05)  # 1.0 on the flat
        f_slope = np.clip(f_slope, 0, 1)
    else:
        f_slope = vehicle_slope_factor(slope, v)

    f_lc, lc_nogo, lc_prov = landcover_factor(g, v)
    prov |= lc_prov
    rci_map = rci(g.soil, moisture)
    soil_cls, f_soil = soil_passability(rci_map, v)
    prov[soil_cls != GO] |= P_SOIL

    off_speed = v.v_offroad_kmh / 3.6 * f_slope * f_lc * f_soil
    road_speed = v.v_road_kmh / 3.6 * f_slope
    roads = g.roads
    speed = np.where(roads, road_speed, off_speed)
    nogo = np.where(roads, slope_nogo, slope_nogo | lc_nogo | (soil_cls == NOGO))
    speed[nogo] = 0.0

    mcoo = np.full(g.shape, GO, dtype=np.uint8)
    restricted_off = (f_slope * f_lc * f_soil < 0.5) | (soil_cls == SLOW) | slope_slow
    mcoo[~roads & restricted_off] = SLOW
    mcoo[roads & slope_slow] = SLOW
    mcoo[nogo | (speed <= 0.05)] = NOGO
    # on-road cells keep their reason only for slope
    prov[roads] &= P_SLOPE

    with np.errstate(divide="ignore"):
        cost = np.where(speed > 0.05, 1.0 / speed, np.inf)
    return MobilityResult(v, speed, cost, mcoo, prov, rci_map, slope)
