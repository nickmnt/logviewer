from __future__ import annotations

import json
from pathlib import Path

from .models import FileRecord


class FileCatalog:
    def __init__(self, storage_path: str | Path | None = None) -> None:
        self._storage_path = Path(storage_path) if storage_path else None
        self._records: dict[str, FileRecord] = {}
        self._recents: list[str] = []
        self._load()

    def _load(self) -> None:
        if self._storage_path is None or not self._storage_path.exists():
            return

        payload = json.loads(self._storage_path.read_text())
        self._recents = list(payload.get("recents", []))
        for item in payload.get("records", []):
            record = FileRecord(
                path=item["path"],
                label=item["label"],
                is_favorite=item.get("is_favorite", False),
            )
            self._records[record.path] = record

    def _persist(self) -> None:
        if self._storage_path is None:
            return

        payload = {
            "recents": self._recents,
            "records": [
                {
                    "path": record.path,
                    "label": record.label,
                    "is_favorite": record.is_favorite,
                }
                for record in self._records.values()
            ],
        }
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        self._storage_path.write_text(json.dumps(payload, indent=2, sort_keys=True))

    def add_recent(self, path: str, label: str) -> FileRecord:
        existing = self._records.get(path)
        record = FileRecord(path=path, label=label, is_favorite=existing.is_favorite if existing else False)
        self._records[path] = record
        self._recents = [item for item in self._recents if item != path]
        self._recents.insert(0, path)
        self._persist()
        return record

    def toggle_favorite(self, path: str, label: str) -> FileRecord:
        existing = self._records.get(path)
        record = FileRecord(
            path=path,
            label=label,
            is_favorite=not existing.is_favorite if existing else True,
        )
        self._records[path] = record
        self._persist()
        return record

    def open_candidates(self) -> list[FileRecord]:
        favorites_in_recents: list[FileRecord] = []
        nonfavorite_recents: list[FileRecord] = []
        seen: set[str] = set()

        for path in self._recents:
            record = self._records[path]
            if record.is_favorite:
                favorites_in_recents.append(record)
            else:
                nonfavorite_recents.append(record)
            seen.add(path)

        favorite_only = [
            record
            for path, record in self._records.items()
            if record.is_favorite and path not in seen
        ]
        favorite_only.sort(key=lambda record: record.label.casefold())
        return favorites_in_recents + favorite_only + nonfavorite_recents
