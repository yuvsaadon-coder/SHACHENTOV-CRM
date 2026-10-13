"""Terrain grid: the single harmonised raster stack every engine works on.

All layers share one metric grid (UTM-like, row 0 = north). Elevation is kept as
two surfaces per the spec: DTM (bare earth, for mobility/slope) and DSM
(with buildings and canopy, for line of sight). dH = DSM - DTM is the
concealment/obstruction height.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

# Land-cover classes (ESA WorldCover-compatible codes)
LC_TREE = 10
LC_SHRUB = 20
LC_GRASS = 30
LC_CROP = 40
LC_BUILT = 50
LC_BARE = 60
LC_WATER = 80

LANDCOVER_NAMES = {
    LC_TREE: "יער / כיסוי עצים",
    LC_SHRUB: "שיחייה",
    LC_GRASS: "עשבייה",
    LC_CROP: "חקלאות",
    LC_BUILT: "שטח בנוי",
    LC_BARE: "קרקע חשופה",
    LC_WATER: "מים",
}

# Soil texture classes (USCS-like simplification of SoilGrids clay/sand)
SOIL_GRAVEL = 0  # GW/GP
SOIL_SAND = 1  # SW/SP
SOIL_SILT = 2  # ML
SOIL_CLAY = 3  # CL
SOIL_FAT_CLAY = 4  # CH

SOIL_NAMES = {
    SOIL_GRAVEL: "חצץ (GW/GP)",
    SOIL_SAND: "חול (SW/SP)",
    SOIL_SILT: "סילט (ML)",
    SOIL_CLAY: "חרסית (CL)",
    SOIL_FAT_CLAY: "חרסית שמנה (CH)",
}


@dataclass
class TerrainGrid:
    dtm: np.ndarray  # bare-earth elevation [m]
    cell_size: float  # [m]
    dsm: np.ndarray | None = None  # surface model incl. buildings/canopy [m]
    landcover: np.ndarray | None = None  # WorldCover codes
    soil: np.ndarray | None = None  # SOIL_* classes
    roads: np.ndarray | None = None  # bool mask
    origin: tuple[float, float] = (0.0, 0.0)  # (easting, northing) of the NW corner
    crs: str = "LOCAL"
    vertical_rmse: float = 4.0  # documented vertical error of the source [m]
    name: str = "terrain"
    meta: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.dtm = np.asarray(self.dtm, dtype=np.float64)
        if self.dsm is None:
            self.dsm = self.dtm.copy()
        if self.landcover is None:
            self.landcover = np.full(self.dtm.shape, LC_GRASS, dtype=np.uint8)
        if self.soil is None:
            self.soil = np.full(self.dtm.shape, SOIL_SILT, dtype=np.uint8)
        if self.roads is None:
            self.roads = np.zeros(self.dtm.shape, dtype=bool)
        for layer in (self.dsm, self.landcover, self.soil, self.roads):
            if layer.shape != self.dtm.shape:
                raise ValueError("all layers must share the DTM shape")

    @property
    def shape(self) -> tuple[int, int]:
        return self.dtm.shape

    @property
    def dh(self) -> np.ndarray:
        """Obstruction height above ground (buildings, canopy)."""
        return np.maximum(self.dsm - self.dtm, 0.0)

    def in_bounds(self, r: int, c: int) -> bool:
        return 0 <= r < self.shape[0] and 0 <= c < self.shape[1]

    def to_cell(self, x: float, y: float) -> tuple[int, int]:
        """Map coordinates (easting, northing) -> (row, col)."""
        c = int((x - self.origin[0]) / self.cell_size)
        r = int((self.origin[1] - y) / self.cell_size)
        return r, c

    def to_xy(self, r: int, c: int) -> tuple[float, float]:
        """Cell centre -> map coordinates."""
        return (
            self.origin[0] + (c + 0.5) * self.cell_size,
            self.origin[1] - (r + 0.5) * self.cell_size,
        )


def _smooth_noise(rng: np.random.Generator, shape, scale: int) -> np.ndarray:
    """Cheap fractal-ish noise: upsampled random lattice."""
    h, w = shape
    gh, gw = h // scale + 2, w // scale + 2
    lattice = rng.standard_normal((gh, gw))
    yy = np.linspace(0, gh - 1.001, h)
    xx = np.linspace(0, gw - 1.001, w)
    y0, x0 = yy.astype(int), xx.astype(int)
    fy, fx = (yy - y0)[:, None], (xx - x0)[None, :]
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)  # smoothstep
    a = lattice[np.ix_(y0, x0)]
    b = lattice[np.ix_(y0, x0 + 1)]
    c = lattice[np.ix_(y0 + 1, x0)]
    d = lattice[np.ix_(y0 + 1, x0 + 1)]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def synthetic_scenario(size: int = 500, cell_size: float = 10.0, seed: int = 7) -> TerrainGrid:
    """Generate an offline training sector with all three terrain types.

    Contents: a dominant ridge running N-S with a saddle, a wadi in the south,
    a dense village in the east (MOUT), an orchard/forest block in the north-west
    (wooded), open hills elsewhere, a road network and a stream.
    """
    rng = np.random.default_rng(seed)
    h = w = size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64) / size
    # relief is designed for a ~4 km sector; scale it so small sectors keep realistic slopes
    k = min(1.0, size * cell_size / 4000.0)

    z = 300.0
    z = z + 40 * k * _smooth_noise(rng, (h, w), max(size // 6, 4))
    z = z + 12 * k * _smooth_noise(rng, (h, w), max(size // 20, 2))
    # Main ridge (N-S) with a saddle in the middle
    ridge = 160 * k * np.exp(-((xx - 0.45) ** 2) / 0.006)
    saddle = 1 - 0.55 * np.exp(-((yy - 0.5) ** 2) / 0.004)
    z = z + ridge * saddle
    # Dominant hill (key terrain candidate) in the NE
    z = z + 110 * k * np.exp(-(((xx - 0.78) ** 2) + (yy - 0.22) ** 2) / 0.008)
    # Wadi running W->E in the south
    wadi_line = 0.8 + 0.05 * np.sin(xx * 9)
    wadi = np.exp(-((yy - wadi_line) ** 2) / 0.0006)
    z = z - 35 * k * wadi
    # Gentle regional tilt westward
    z = z + 60 * k * xx

    dtm = z

    landcover = np.full((h, w), LC_GRASS, dtype=np.uint8)
    landcover[_smooth_noise(rng, (h, w), max(size // 10, 3)) > 0.6] = LC_SHRUB
    landcover[(yy > 0.55) & (xx < 0.35) & (_smooth_noise(rng, (h, w), 8) > -0.2)] = LC_CROP
    forest = (xx < 0.3) & (yy < 0.4) & (_smooth_noise(rng, (h, w), 6) > -0.5)
    landcover[forest] = LC_TREE
    bare = ridge * saddle > 100 * k
    landcover[bare & ~forest] = LC_BARE
    landcover[wadi > 0.6] = LC_WATER

    # Village (MOUT) east of the ridge
    dsm = dtm.copy()
    village = ((xx - 0.72) ** 2 + (yy - 0.6) ** 2) < 0.006
    landcover[village] = LC_BUILT
    building_noise = rng.random((h, w))
    # Block structure: streets every 6 cells
    rr, cc = np.mgrid[0:h, 0:w]
    street = (rr % 6 == 0) | (cc % 7 == 0)
    buildings = village & ~street & (building_noise > 0.15)
    dsm[buildings] += rng.choice([4.0, 7.0, 10.0, 13.0], size=int(buildings.sum()))
    # Canopy
    dsm[landcover == LC_TREE] += 8 + 4 * rng.random(int((landcover == LC_TREE).sum()))

    # Soil: gravel on the ridge, clay in the valley, sand elsewhere
    soil = np.full((h, w), SOIL_SAND, dtype=np.uint8)
    soil[_smooth_noise(rng, (h, w), max(size // 8, 3)) > 0.3] = SOIL_SILT
    soil[(yy > 0.6) & (xx < 0.4)] = SOIL_CLAY
    soil[wadi > 0.3] = SOIL_FAT_CLAY
    soil[ridge * saddle > 60 * k] = SOIL_GRAVEL

    roads = np.zeros((h, w), dtype=bool)
    # E-W road through the saddle, N-S road west of the ridge, village access
    road_r = (h // 2 + (8 * np.sin(np.arange(w) / 25)).astype(int)).clip(0, h - 1)
    roads[road_r, np.arange(w)] = True
    road_c = (int(w * 0.2) + (6 * np.sin(np.arange(h) / 30)).astype(int)).clip(0, w - 1)
    roads[np.arange(h), road_c] = True
    roads[village & street] = True
    landcover[roads & (landcover == LC_WATER)] = LC_BARE  # bridges/fords
    # widen roads to two cells
    roads[:, 1:] |= roads[:, :-1]
    dsm[roads] = dtm[roads]

    return TerrainGrid(
        dtm=dtm,
        dsm=dsm,
        cell_size=cell_size,
        landcover=landcover,
        soil=soil,
        roads=roads,
        origin=(700000.0, 3650000.0),
        crs="EPSG:32636 (synthetic)",
        vertical_rmse=4.0,
        name="גזרת אימון סינתטית",
        meta={"source": "synthetic", "seed": seed},
    )


def load_geotiff(dtm_path: str, dsm_path: str | None = None, landcover_path: str | None = None) -> TerrainGrid:
    """Load real data (e.g. Copernicus GLO-30 reprojected to UTM with gdalwarp).

    Expected preprocessing (GDAL CLI), as in the spec's harmonisation pipeline:
        gdalwarp -t_srs EPSG:32636 -tr 10 10 -r cubicspline glo30.tif dsm_utm.tif
        gdalwarp -t_srs EPSG:32636 -tr 10 10 -r near worldcover.tif lc_utm.tif
    """
    try:
        import rasterio
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("rasterio is required for GeoTIFF input: pip install rasterio") from exc

    def read(path):
        with rasterio.open(path) as ds:
            return ds.read(1).astype(np.float64), ds.transform, ds.crs

    dtm, transform, crs = read(dtm_path)
    if abs(transform.a) != abs(transform.e):
        raise ValueError("grid must have square cells; resample with gdalwarp -tr")
    dsm = read(dsm_path)[0] if dsm_path else None
    lc = read(landcover_path)[0].astype(np.uint8) if landcover_path else None
    return TerrainGrid(
        dtm=dtm,
        dsm=dsm,
        landcover=lc,
        cell_size=abs(transform.a),
        origin=(transform.c, transform.f),
        crs=str(crs),
        name=dtm_path,
        meta={"source": "geotiff"},
    )


def copernicus_tile_url(lat: float, lon: float) -> str:
    """URL of the Copernicus GLO-30 COG tile covering (lat, lon) on the AWS open bucket."""
    import math

    la, lo = math.floor(lat), math.floor(lon)
    ns = f"{'N' if la >= 0 else 'S'}{abs(la):02d}_00"
    ew = f"{'E' if lo >= 0 else 'W'}{abs(lo):03d}_00"
    name = f"Copernicus_DSM_COG_10_{ns}_{ew}_DEM"
    return f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"
