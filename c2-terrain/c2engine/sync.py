"""Intermittent delta sync for planning overlays (sector boundaries, enemy marks, fire plans).

A state-based CRDT: a map of last-writer-wins registers. Each write carries a
Lamport timestamp and the writing node id, so concurrent edits on disconnected
nodes converge deterministically on merge (higher (lamport, node) wins;
deletes are tombstones). Each node keeps a version vector; `delta_since`
returns only the entries the peer has not seen, compressed for a narrow-band
link (zlib JSON here; Protobuf is a drop-in replacement for the codec).
"""
from __future__ import annotations

import json
import threading
import zlib
from dataclasses import dataclass, field


@dataclass
class Entry:
    key: str
    value: dict | None  # None = tombstone
    lamport: int
    node: str

    def stamp(self) -> tuple[int, str]:
        return (self.lamport, self.node)

    def to_dict(self) -> dict:
        return {"key": self.key, "value": self.value, "lamport": self.lamport, "node": self.node}


@dataclass
class OverlayStore:
    node_id: str
    entries: dict[str, Entry] = field(default_factory=dict)
    clock: int = 0
    version: dict[str, int] = field(default_factory=dict)  # node -> max lamport seen
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def _tick(self) -> int:
        self.clock += 1
        self.version[self.node_id] = self.clock
        return self.clock

    def put(self, key: str, value: dict) -> Entry:
        with self._lock:
            e = Entry(key, value, self._tick(), self.node_id)
            self.entries[key] = e
            return e

    def delete(self, key: str) -> Entry:
        with self._lock:
            e = Entry(key, None, self._tick(), self.node_id)
            self.entries[key] = e
            return e

    def items(self) -> dict[str, dict]:
        return {k: e.value for k, e in self.entries.items() if e.value is not None}

    def delta_since(self, peer_version: dict[str, int]) -> list[Entry]:
        return [e for e in self.entries.values() if e.lamport > peer_version.get(e.node, 0)]

    def merge(self, delta: list[Entry]) -> int:
        """Apply remote entries; returns how many changed local state."""
        changed = 0
        with self._lock:
            for e in delta:
                cur = self.entries.get(e.key)
                if cur is None or e.stamp() > cur.stamp():
                    self.entries[e.key] = e
                    changed += 1
                self.version[e.node] = max(self.version.get(e.node, 0), e.lamport)
                self.clock = max(self.clock, e.lamport)
        return changed


def encode_delta(entries: list[Entry]) -> bytes:
    return zlib.compress(json.dumps([e.to_dict() for e in entries], separators=(",", ":")).encode(), 9)


def decode_delta(blob: bytes) -> list[Entry]:
    return [Entry(**d) for d in json.loads(zlib.decompress(blob))]
