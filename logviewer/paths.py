from __future__ import annotations

import os
from pathlib import Path


def app_storage_dir() -> Path:
    override = os.environ.get("LOGVIEWER_HOME")
    if override:
        path = Path(override).expanduser()
        path.mkdir(parents=True, exist_ok=True)
        return path

    preferred = Path.home() / ".logviewer"
    try:
        preferred.mkdir(parents=True, exist_ok=True)
        return preferred
    except OSError:
        fallback = Path.cwd() / ".logviewer"
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback


def favorites_path() -> Path:
    return app_storage_dir() / "favorites-and-recents.json"


def saved_views_path() -> Path:
    return app_storage_dir() / "saved-views.json"
