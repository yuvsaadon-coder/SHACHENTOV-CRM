"""Bitemporal change detection.

Two back-ends behind one interface:
* `cva` - deterministic Change Vector Analysis baseline (no training needed).
* `onnx` - any Siamese change model exported to ONNX (ChangeFormer / BIT via
  TorchGeo or OpenCD) taking (1, C, H, W) x 2 and returning change logits.

Both are followed by the deterministic NDVI seasonal filter from the spec:
changes explained by vegetation phenology alone are removed.
Input bands order: [Blue, Green, Red, NIR] reflectance in [0, 1].
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage


def ndvi(img: np.ndarray) -> np.ndarray:
    red, nir = img[2].astype(np.float64), img[3].astype(np.float64)
    return (nir - red) / np.maximum(nir + red, 1e-6)


def cva_probability(
    t1: np.ndarray,
    t2: np.ndarray,
    threshold: float | None = None,
    scale: float | None = None,
    ignore: np.ndarray | None = None,
) -> np.ndarray:
    """P_change = sigmoid((|X1 - X2| - thr) / scale); thr = median + 6 robust sigma of the
    unchanged background (pixels in `ignore`, e.g. seasonal, are left out of the statistics)."""
    diff = np.sqrt(((t2.astype(np.float64) - t1.astype(np.float64)) ** 2).sum(axis=0))
    if threshold is None:
        bg = diff[~ignore] if ignore is not None and (~ignore).any() else diff.ravel()
        med = np.median(bg)
        mad = np.median(np.abs(bg - med)) + 1e-9
        threshold = med + 6 * 1.4826 * mad
    if scale is None:
        scale = max(threshold * 0.15, 1e-6)
    return 1.0 / (1.0 + np.exp(-(diff - threshold) / scale))


def seasonal_mask(t1: np.ndarray, t2: np.ndarray, ndvi_delta: float = 0.15) -> np.ndarray:
    """True where the change is vegetation-driven: NDVI moved a lot while the
    vegetation-insensitive visible bands (blue, green) barely changed."""
    d_ndvi = np.abs(ndvi(t2) - ndvi(t1))
    d_vis = np.abs(t2[:2].astype(np.float64) - t1[:2].astype(np.float64)).mean(axis=0)
    return (d_ndvi > ndvi_delta) & (d_vis < 0.04)


class OnnxChangeModel:  # pragma: no cover - requires onnxruntime and a model file
    def __init__(self, path: str, tile: int = 512):
        import onnxruntime as ort

        self.session = ort.InferenceSession(path, providers=ort.get_available_providers())
        self.inputs = [i.name for i in self.session.get_inputs()]
        self.tile = tile

    def __call__(self, t1: np.ndarray, t2: np.ndarray) -> np.ndarray:
        C, H, W = t1.shape
        out = np.zeros((H, W), dtype=np.float32)
        s = self.tile
        for r in range(0, H, s):
            for c in range(0, W, s):
                a = t1[None, :, r : r + s, c : c + s].astype(np.float32)
                b = t2[None, :, r : r + s, c : c + s].astype(np.float32)
                logits = self.session.run(None, {self.inputs[0]: a, self.inputs[1]: b})[0]
                out[r : r + s, c : c + s] = 1 / (1 + np.exp(-logits.reshape(logits.shape[-2:])))
        return out


def detect_changes(
    t1: np.ndarray,
    t2: np.ndarray,
    cell: float = 10.0,
    model: OnnxChangeModel | None = None,
    p_threshold: float = 0.5,
    min_area_m2: float = 300.0,
) -> tuple[np.ndarray, list[dict]]:
    if t1.shape != t2.shape or t1.shape[0] < 4:
        raise ValueError("expected two co-registered (4, H, W) images")
    seasonal = seasonal_mask(t1, t2)
    p = model(t1, t2) if model is not None else cva_probability(t1, t2, ignore=seasonal)
    p = np.where(seasonal, 0.0, p)
    mask = p >= p_threshold
    lab, n = ndimage.label(mask)
    polys = []
    for i in range(1, n + 1):
        m = lab == i
        area = float(m.sum()) * cell * cell
        if area < min_area_m2:
            p[m] = np.minimum(p[m], p_threshold - 1e-3)
            continue
        rr, cc = np.nonzero(m)
        polys.append({
            "id": len(polys) + 1,
            "bbox": [int(rr.min()), int(cc.min()), int(rr.max()), int(cc.max())],
            "centroid": [int(rr.mean()), int(cc.mean())],
            "area_m2": area,
            "p_mean": round(float(p[m].mean()), 3),
            "model_ver": "onnx" if model is not None else "cva-baseline-1",
        })
    return p, polys


def synthetic_pair(shape=(200, 200), seed: int = 3) -> tuple[np.ndarray, np.ndarray, list[tuple[slice, slice]]]:
    """Demo pair: seasonal greening everywhere + two real earthworks (bare soil) + one new track."""
    rng = np.random.default_rng(seed)
    H, W = shape
    base = np.stack([np.full(shape, 0.06), np.full(shape, 0.09), np.full(shape, 0.10), np.full(shape, 0.25)])
    base += rng.normal(0, 0.005, base.shape)
    t1 = base.copy()
    t2 = base.copy()
    # seasonal greening in the west half: NIR up, red down slightly, visible ~same
    t2[3, :, : W // 2] += 0.15
    t2[2, :, : W // 2] -= 0.03
    truths = [(slice(40, 52), slice(130, 150)), (slice(140, 150), slice(60, 75)), (slice(100, 103), slice(90, 190))]
    for rs, cs in truths:  # bright bare soil / earthworks
        t2[0, rs, cs], t2[1, rs, cs], t2[2, rs, cs], t2[3, rs, cs] = 0.18, 0.22, 0.27, 0.30
    return t1, t2, truths
