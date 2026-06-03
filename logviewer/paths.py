from __future__ import annotations

import os
from pathlib import Path


def _ensure_writable_directory(path: Path) -> bool:
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".write-probe"
        probe.write_text("ok")
        probe.unlink()
        return True
    except OSError:
        return False


def app_storage_dir() -> Path:
    override = os.environ.get("LOGVIEWER_HOME")
    if override:
        path = Path(override).expanduser()
        if _ensure_writable_directory(path):
            return path
        raise OSError(f"LOGVIEWER_HOME is not writable: {path}")

    preferred = Path.home() / ".logviewer"
    if _ensure_writable_directory(preferred):
        return preferred

    fallback = Path.cwd() / ".logviewer"
    if _ensure_writable_directory(fallback):
        return fallback

    raise OSError("Could not find a writable logviewer storage directory.")


def favorites_path() -> Path:
    return app_storage_dir() / "favorites-and-recents.json"


def saved_views_path() -> Path:
    return app_storage_dir() / "saved-views.json"
