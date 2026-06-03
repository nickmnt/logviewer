from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path

from .catalog import FileCatalog
from .chrome import close_overlay, default_chrome_state, open_overlay, pause_follow, summarize_filters, toggle_detail
from .filtering import apply_filter
from .models import FilterSpec, LogEntry, SavedView, UiChromeState
from .parsing import parse_nlog_line
from .paths import favorites_path, saved_views_path
from .saved_views import SavedViewStore


@dataclass(frozen=True)
class ViewerSnapshot:
    current_file: str | None
    visible_entries: tuple[LogEntry, ...]
    selected_index: int
    total_entries: int
    chrome: UiChromeState
    active_filter: FilterSpec
    active_view: SavedView | None


class ViewerController:
    def __init__(
        self,
        file_catalog: FileCatalog | None = None,
        saved_views: SavedViewStore | None = None,
    ) -> None:
        self.file_catalog = file_catalog or FileCatalog(favorites_path())
        self.saved_views = saved_views or SavedViewStore(saved_views_path())
        self.current_file: str | None = None
        self.entries: list[LogEntry] = []
        self.filtered_entries: list[LogEntry] = []
        self.selected_index = 0
        self.active_filter = FilterSpec()
        self.chrome = default_chrome_state()
        self._refresh_filtered_entries()

    def _refresh_filtered_entries(self) -> None:
        self.filtered_entries = apply_filter(self.entries, self.active_filter)
        if self.filtered_entries:
            self.selected_index = min(self.selected_index, len(self.filtered_entries) - 1)
        else:
            self.selected_index = 0
        self.chrome = replace(self.chrome, summary_tokens=summarize_filters(self.active_filter))

    def snapshot(self) -> ViewerSnapshot:
        return ViewerSnapshot(
            current_file=self.current_file,
            visible_entries=tuple(self.filtered_entries),
            selected_index=self.selected_index,
            total_entries=len(self.entries),
            chrome=self.chrome,
            active_filter=self.active_filter,
            active_view=self.saved_views.active_view(),
        )

    def open_file(self, path: str) -> ViewerSnapshot:
        file_path = Path(path)
        self.current_file = str(file_path)
        label = file_path.name or str(file_path)
        self.file_catalog.add_recent(str(file_path), label)
        self.entries = [parse_nlog_line(line) for line in file_path.read_text().splitlines()]
        self._refresh_filtered_entries()
        return self.snapshot()

    def reload_current_file(self) -> ViewerSnapshot:
        if self.current_file is None:
            return self.snapshot()
        return self.open_file(self.current_file)

    def toggle_favorite_current_file(self) -> None:
        if self.current_file is None:
            return
        path = Path(self.current_file)
        self.file_catalog.toggle_favorite(str(path), path.name or str(path))

    def apply_filter_spec(self, filter_spec: FilterSpec) -> ViewerSnapshot:
        self.active_filter = filter_spec
        self._refresh_filtered_entries()
        return self.snapshot()

    def save_view(self, name: str) -> SavedView:
        return self.saved_views.save(name, self.active_filter)

    def activate_saved_view(self, name: str) -> ViewerSnapshot:
        view = self.saved_views.activate(name)
        self.active_filter = view.filter_spec
        self._refresh_filtered_entries()
        return self.snapshot()

    def toggle_detail(self) -> ViewerSnapshot:
        self.chrome = toggle_detail(self.chrome)
        return self.snapshot()

    def toggle_follow_pause(self) -> ViewerSnapshot:
        self.chrome = pause_follow(self.chrome)
        return self.snapshot()

    def show_overlay(self, name: str) -> ViewerSnapshot:
        self.chrome = open_overlay(self.chrome, name)
        return self.snapshot()

    def hide_overlay(self) -> ViewerSnapshot:
        self.chrome = close_overlay(self.chrome)
        return self.snapshot()

    def move_selection(self, delta: int) -> ViewerSnapshot:
        if self.filtered_entries:
            self.selected_index = max(0, min(self.selected_index + delta, len(self.filtered_entries) - 1))
        return self.snapshot()

    def set_selection(self, index: int) -> ViewerSnapshot:
        if self.filtered_entries:
            self.selected_index = max(0, min(index, len(self.filtered_entries) - 1))
        else:
            self.selected_index = 0
        return self.snapshot()

    def selected_entry(self) -> LogEntry | None:
        if not self.filtered_entries:
            return None
        return self.filtered_entries[self.selected_index]
