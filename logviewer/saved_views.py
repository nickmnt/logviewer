from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from .models import FilterSpec, LogLevel, SavedView


def _serialize_filter_spec(filter_spec: FilterSpec) -> dict[str, object]:
    payload = asdict(filter_spec)
    payload["include_levels"] = [level.value for level in filter_spec.include_levels]
    payload["exclude_levels"] = [level.value for level in filter_spec.exclude_levels]
    payload["include_categories"] = sorted(filter_spec.include_categories)
    payload["exclude_categories"] = sorted(filter_spec.exclude_categories)
    payload["start_time"] = filter_spec.start_time.isoformat() if filter_spec.start_time else None
    payload["end_time"] = filter_spec.end_time.isoformat() if filter_spec.end_time else None
    return payload


def _deserialize_filter_spec(payload: dict[str, object]) -> FilterSpec:
    return FilterSpec(
        include_levels=frozenset(LogLevel(item) for item in payload.get("include_levels", [])),
        exclude_levels=frozenset(LogLevel(item) for item in payload.get("exclude_levels", [])),
        include_categories=frozenset(payload.get("include_categories", [])),
        exclude_categories=frozenset(payload.get("exclude_categories", [])),
        text_query=payload.get("text_query"),
        start_time=datetime.fromisoformat(payload["start_time"]) if payload.get("start_time") else None,
        end_time=datetime.fromisoformat(payload["end_time"]) if payload.get("end_time") else None,
    )


class SavedViewStore:
    def __init__(self, storage_path: str | Path | None = None) -> None:
        self._storage_path = Path(storage_path) if storage_path else None
        self._views: dict[str, SavedView] = {}
        self._active_name: str | None = None
        self._load()

    def _load(self) -> None:
        if self._storage_path is None or not self._storage_path.exists():
            return

        try:
            payload = json.loads(self._storage_path.read_text())
        except json.JSONDecodeError:
            return
        self._active_name = payload.get("active_name")
        for item in payload.get("views", []):
            view = SavedView(
                name=item["name"],
                filter_spec=_deserialize_filter_spec(item["filter_spec"]),
                enabled=item.get("enabled", True),
            )
            self._views[view.name] = view

    def _persist(self) -> None:
        if self._storage_path is None:
            return

        payload = {
            "active_name": self._active_name,
            "views": [
                {
                    "name": view.name,
                    "enabled": view.enabled,
                    "filter_spec": _serialize_filter_spec(view.filter_spec),
                }
                for view in self.list_views()
            ],
        }
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        self._storage_path.write_text(json.dumps(payload, indent=2, sort_keys=True))

    def save(self, name: str, filter_spec: FilterSpec) -> SavedView:
        view = SavedView(name=name, filter_spec=filter_spec, enabled=True)
        self._views[name] = view
        self._persist()
        return view

    def enable(self, name: str) -> SavedView:
        view = self._views[name]
        updated = SavedView(name=view.name, filter_spec=view.filter_spec, enabled=True)
        self._views[name] = updated
        self._persist()
        return updated

    def disable(self, name: str) -> SavedView:
        view = self._views[name]
        updated = SavedView(name=view.name, filter_spec=view.filter_spec, enabled=False)
        self._views[name] = updated
        if self._active_name == name:
            self._active_name = None
        self._persist()
        return updated

    def activate(self, name: str) -> SavedView:
        view = self._views[name]
        if not view.enabled:
            view = self.enable(name)
        self._active_name = name
        self._persist()
        return view

    def active_view(self) -> SavedView | None:
        if self._active_name is None:
            return None
        return self._views[self._active_name]

    def list_views(self) -> list[SavedView]:
        return [self._views[name] for name in sorted(self._views)]
