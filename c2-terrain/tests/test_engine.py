import numpy as np
import pytest

from c2engine import change as C
from c2engine import grid as G
from c2engine import mobility as M
from c2engine import routing as R
from c2engine import threat as T
from c2engine import visibility as V
from c2engine.sync import OverlayStore, decode_delta, encode_delta
from c2engine.terrain import fill_depressions, slope_percent, tpi


def flat(n=101, cell=10.0, z=100.0):
    return G.TerrainGrid(dtm=np.full((n, n), z), cell_size=cell)


# ------------------------------------------------------------------ visibility
def test_flat_terrain_fully_visible():
    g = flat()
    vs = V.viewshed(g, (50, 50), max_range_m=1e9, target_height=0.5)
    assert vs.in_range.all() and vs.visible.all()


def test_wall_blocks_and_dead_ground_depth():
    g = flat()
    g.dtm[:, 60] += 20.0  # 20 m wall, 100 m east of the observer
    g.dsm = g.dtm.copy()
    vs = V.viewshed(g, (50, 50), observer_height=2.0, target_height=0.0, max_range_m=1e9)
    assert vs.visible[50, 55]
    assert not vs.visible[50, 80]
    # similar triangles: horizon slope = (20-2)/100 at d=100 m; at 300 m need 18*3 - (-2) offset
    d = 300.0
    expected = (20.0 - 2.0) / 100.0 * d + 2.0
    assert vs.agl_needed[50, 80] == pytest.approx(expected, abs=1.0)


def test_earth_curvature_hides_distant_ground():
    g = G.TerrainGrid(dtm=np.zeros((5, 1601)), cell_size=10.0)
    vs = V.viewshed(g, (2, 0), observer_height=2.0, target_height=0.0, max_range_m=20000)
    horizon = np.sqrt(2 * V.EARTH_RADIUS * 2.0 / V.CC_OPTICAL)  # ~5.45 km
    assert vs.visible[2, int(horizon * 0.8 / 10)]
    assert not vs.visible[2, int(horizon * 1.3 / 10)]
    tall = V.viewshed(g, (2, 0), observer_height=2.0, target_height=10.0, max_range_m=20000)
    assert tall.visible[2, int(horizon * 1.3 / 10)]


def test_line_of_sight_and_intervisibility():
    g = flat()
    g.dtm[40:60, 50] += 30
    g.dsm = g.dtm.copy()
    assert not V.line_of_sight(g, (50, 10), (50, 90))["visible"]
    assert V.line_of_sight(g, (10, 10), (10, 90))["visible"]
    m = V.intervisibility_matrix(g, [(50, 10), (50, 90), (10, 50)])
    assert m.shape == (3, 3) and not m[0, 1] and m[0, 2]


def test_buildings_in_dsm_block_sight_but_not_ground_reference():
    g = flat()
    g.dsm[45:56, 60:63] += 12.0  # building
    vs = V.viewshed(g, (50, 50), max_range_m=1e9, target_height=2.0)
    assert not vs.visible[50, 75]


def test_fresnel_radius_and_status():
    g = G.TerrainGrid(dtm=np.zeros((3, 501)), cell_size=10.0)
    # 5 km, 60 MHz -> lambda = 5 m; r_F1 at midpoint = sqrt(5 * 2500 * 2500 / 5000) = 79 m
    low = V.radio_link(g, (1, 0), (1, 500), freq_mhz=60, h1=10, h2=10)
    assert low["status"] in ("fresnel_obstructed", "blocked")
    high = V.radio_link(g, (1, 0), (1, 500), freq_mhz=60, h1=120, h2=120)
    assert high["status"] == "clear"
    assert high["diffraction_loss_db"] == 0.0
    assert high["fspl_db"] == pytest.approx(20 * np.log10(5) + 20 * np.log10(60) + 32.44, abs=0.2)


def test_knife_edge_monotonic():
    assert V.knife_edge_loss_db(-1.0) == 0.0
    assert V.knife_edge_loss_db(0.0) == pytest.approx(6.0, abs=0.1)
    assert V.knife_edge_loss_db(2.0) > V.knife_edge_loss_db(1.0)


def test_visibility_probability_bounds():
    g = G.synthetic_scenario(80)
    p = V.visibility_probability(g, (40, 40), runs=5, max_range_m=600)
    assert p.min() >= 0 and p.max() <= 1 and p[40, 40] == 1


# ------------------------------------------------------------------ terrain
def test_slope_and_tpi():
    z = np.tile(np.arange(50) * 1.0, (50, 1))  # 1 m rise per 10 m cell east
    assert np.median(slope_percent(z, 10.0)) == pytest.approx(10.0, abs=0.01)
    hill = np.zeros((51, 51))
    hill[25, 25] = 50
    assert tpi(hill, 10.0, 100.0)[25, 25] > 0


def test_fill_depressions():
    z = np.full((20, 20), 10.0)
    z[8:12, 8:12] = 2.0
    f = fill_depressions(z)
    assert f[10, 10] == pytest.approx(10.0)
    assert (f >= z).all()


# ------------------------------------------------------------------ mobility
def test_vci_from_mobility_index_is_monotonic():
    a, b = M.vci_tracked(50), M.vci_tracked(120)
    assert a[0] < b[0] and a[1] < b[1] and a[0] < a[1]


def test_slope_thresholds_and_spatial_consistency():
    g = flat(60)
    g.dtm[:, 30:] += np.arange(30) * 6.0  # 60% slope block
    g.dtm[10, 5] += 8.0  # single noisy spike
    g.dsm = g.dtm.copy()
    m = M.mobility(g, "mbt")
    assert m.mcoo[30, 45] == M.NOGO
    assert (m.provenance[30, 45] & M.P_SLOPE)
    assert m.mcoo[10, 5] != M.NOGO  # isolated pixel is not trusted as NO-GO
    assert np.isinf(m.cost[30, 45])


def test_water_and_wet_clay():
    g = flat(30)
    g.landcover[:, 10] = G.LC_WATER
    g.soil[:, 20:] = G.SOIL_FAT_CLAY
    dry = M.mobility(g, "apc8x8", moisture=0.0)
    wet = M.mobility(g, "apc8x8", moisture=M.soil_moisture_from_precip(60))
    assert dry.mcoo[5, 10] == M.NOGO
    assert dry.mcoo[5, 25] != M.NOGO
    assert wet.mcoo[5, 25] == M.NOGO and wet.provenance[5, 25] & M.P_SOIL


def test_roads_are_faster():
    g = flat(30)
    g.roads[15, :] = True
    m = M.mobility(g, "jeep")
    assert m.speed_ms[15, 5] > m.speed_ms[5, 5]


# ------------------------------------------------------------------ routing
def test_route_goes_through_gap():
    g = flat(60)
    g.landcover[:, 30] = G.LC_WATER
    g.landcover[50, 30] = G.LC_BARE  # ford
    m = M.mobility(g, "mbt")
    gr = R.build_graph(g, m)
    r = R.least_cost_path(gr, (10, 5), (10, 55), g.cell_size)
    assert r is not None and (50, 30) in r.cells
    cor = R.corridor(gr, (10, 5), (10, 55), 0.05)
    assert all(cor[c] for c in r.cells)


def test_no_route_when_blocked():
    g = flat(30)
    g.landcover[:, 15] = G.LC_WATER
    gr = R.build_graph(g, M.mobility(g, "mbt"))
    assert R.least_cost_path(gr, (5, 2), (5, 28), g.cell_size) is None


def test_k_diverse_paths_are_distinct():
    g = G.synthetic_scenario(120)
    m = M.mobility(g, "mbt")
    routes = R.k_diverse_paths(g, m, (110, 10), (10, 110), k=3)
    assert len(routes) == 3
    s0, s1 = set(routes[0].cells), set(routes[1].cells)
    assert len(s0 & s1) / len(s0) < 0.8
    assert routes[0].time_s <= routes[1].time_s + 1e-6


def test_foot_tobler_anisotropy():
    g = G.TerrainGrid(dtm=np.tile(np.arange(80) * 1.5, (5, 1)), cell_size=10.0)  # 15% slope
    gr = R.build_graph(g, M.mobility(g, "foot"))
    up = R.least_cost_path(gr, (2, 1), (2, 78), g.cell_size).time_s
    down = R.least_cost_path(gr, (2, 78), (2, 1), g.cell_size).time_s
    assert up > down


def test_threat_inflation_avoids_exposure():
    g = flat(40)
    m = M.mobility(g, "mbt")
    exposure = np.zeros(g.shape)
    exposure[15:25, 10:30] = 1.0
    plain = R.least_cost_path(R.build_graph(g, m), (20, 2), (20, 37), g.cell_size)
    safe = R.least_cost_path(R.build_graph(g, m, exposure=exposure, w_threat=10), (20, 2), (20, 37), g.cell_size)
    assert T.route_exposure(safe.cells, exposure)["mean"] < T.route_exposure(plain.cells, exposure)["mean"]


# ------------------------------------------------------------------ threat
@pytest.fixture(scope="module")
def sector():
    g = G.synthetic_scenario(120)
    m = M.mobility(g, "mbt")
    gr = R.build_graph(g, m)
    axis = R.least_cost_path(gr, (110, 10), (10, 110), g.cell_size)
    return g, m, gr, axis


def test_at_likelihood_is_probability(sector):
    g, _, _, axis = sector
    th = T.at_position_likelihood(g, axis.cells, samples=8)
    assert 0 <= th.probability.min() and th.probability.max() <= 1
    assert set(th.features) == {"tpi", "slope", "crest", "v_target", "cover", "canopy"}
    assert th.probability[g.landcover == G.LC_WATER].max(initial=0) == 0


def test_softmax_temperature_spreads_traffic(sector):
    g, _, gr, _ = sector
    cold = T.enemy_route_density(gr, [(5, 110)], (110, 5), tau=0.02, walkers=200)
    hot = T.enemy_route_density(gr, [(5, 110)], (110, 5), tau=5.0, walkers=200)
    assert (hot > 0).sum() > (cold > 0).sum()
    assert cold[110, 5] == pytest.approx(1.0)  # every walker reaches the objective


def test_kts_and_engagement_areas(sector):
    g, m, gr, axis = sector
    traffic = T.enemy_route_density(gr, [(5, 110)], (110, 5), tau=1.0, walkers=100)
    access, _ = R.cost_distance(gr, [(110, 10)])
    kts, comp = T.key_terrain_score(g, axis.cells, traffic, access, samples=6)
    assert kts.shape == g.shape and 0 <= kts.min() and kts.max() <= 1
    ea, eas = T.engagement_area_candidates(g, traffic, m, [(60, 60), (30, 80)], min_observers=1)
    assert ea.dtype == bool
    assert not (ea & (ndimage_smooth(traffic) < 0.05)).any()


def ndimage_smooth(a):
    from scipy import ndimage

    return ndimage.gaussian_filter(a, 1.0)


# ------------------------------------------------------------------ change detection
def test_change_detection_finds_earthworks_not_seasons():
    t1, t2, truths = C.synthetic_pair()
    p, polys = C.detect_changes(t1, t2)
    assert len(polys) == len(truths)
    truth = np.zeros(p.shape, dtype=bool)
    for rs, cs in truths:
        truth[rs, cs] = True
    west = np.zeros(p.shape, dtype=bool)
    west[:, : p.shape[1] // 2] = True  # seasonal greening region
    assert p[west & ~truth].max() < 0.5
    for rs, cs in truths:
        assert p[rs, cs].mean() > 0.9


# ------------------------------------------------------------------ sync
def test_crdt_delta_sync_converges():
    hq, bn = OverlayStore("hq"), OverlayStore("bn1")
    hq.put("boundary", {"v": 1})
    bn.put("enemy-1", {"pos": [1, 2]})
    bn.merge(decode_delta(encode_delta(hq.delta_since(bn.version))))
    hq.merge(decode_delta(encode_delta(bn.delta_since(hq.version))))
    # concurrent conflicting edits while disconnected
    hq.put("enemy-1", {"pos": [5, 5]})
    bn.put("enemy-1", {"pos": [9, 9]})
    bn.delete("boundary")
    d1, d2 = hq.delta_since(bn.version), bn.delta_since(hq.version)
    assert len(d1) == 1  # only the new edit, not the whole state
    bn.merge(d1)
    hq.merge(d2)
    assert hq.items() == bn.items()
    assert "boundary" not in hq.items()
