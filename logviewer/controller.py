from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date
from pathlib import Path

from .catalog import FileCatalog
from .chrome import close_overlay, default_chrome_state, open_overlay, pause_follow, summarize_filters, toggle_detail
from .filtering import apply_filter, entry_contains_text
from .models import FilterSpec, FindState, LogEntry, LogLevel, SavedView, TimeFilterContext, UiChromeState
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
    find_state: FindState


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
        self._current_file_signature: tuple[int, int] | None = None
        self._find_query: str | None = None
        self._find_matches: list[int] = []
        self._active_find_match = 0
        self._refresh_filtered_entries()

    def _file_signature(self, path: Path) -> tuple[int, int]:
        stat = path.stat()
        return (stat.st_mtime_ns, stat.st_size)

    def _load_file(self, path: str, *, track_recent: bool, force: bool) -> tuple[ViewerSnapshot, bool]:
        file_path = Path(path)
        signature = self._file_signature(file_path)
        normalized_path = str(file_path)

        if not force and self.current_file == normalized_path and self._current_file_signature == signature:
            return self.snapshot(), False

        self.current_file = normalized_path
        if track_recent:
            label = file_path.name or normalized_path
            self.file_catalog.add_recent(normalized_path, label)
        self.entries = [parse_nlog_line(line) for line in file_path.read_text().splitlines()]
        self._current_file_signature = signature
        self._refresh_filtered_entries()
        return self.snapshot(), True

    def _refresh_filtered_entries(self) -> None:
        self.filtered_entries = apply_filter(self.entries, self.active_filter)
        if self.filtered_entries:
            self.selected_index = min(self.selected_index, len(self.filtered_entries) - 1)
        else:
            self.selected_index = 0
        self._refresh_find_matches()
        self.chrome = replace(self.chrome, summary_tokens=summarize_filters(self.active_filter))

    def _refresh_find_matches(self) -> None:
        if not self._find_query:
            self._find_matches = []
            self._active_find_match = 0
            return

        current_match_index = None
        if 0 <= self._active_find_match - 1 < len(self._find_matches):
            current_match_index = self._find_matches[self._active_find_match - 1]

        self._find_matches = [
            index
            for index, entry in enumerate(self.filtered_entries)
            if entry_contains_text(entry, self._find_query)
        ]

        if not self._find_matches:
            self._active_find_match = 0
            return

        if current_match_index in self._find_matches:
            self._active_find_match = self._find_matches.index(current_match_index) + 1
            self.selected_index = current_match_index
            return

        next_match_index = next(
            (index for index, match_index in enumerate(self._find_matches) if match_index >= self.selected_index),
            0,
        )
        self._active_find_match = next_match_index + 1
        self.selected_index = self._find_matches[next_match_index]

    def _with_updated_filter(self, *, exclude_levels: frozenset[LogLevel] | None = None, exclude_categories: frozenset[str] | None = None) -> ViewerSnapshot:
        self.active_filter = FilterSpec(
            include_levels=self.active_filter.include_levels,
            exclude_levels=exclude_levels if exclude_levels is not None else self.active_filter.exclude_levels,
            include_categories=self.active_filter.include_categories,
            exclude_categories=exclude_categories if exclude_categories is not None else self.active_filter.exclude_categories,
            text_query=self.active_filter.text_query,
            start_time=self.active_filter.start_time,
            end_time=self.active_filter.end_time,
        )
        self._refresh_filtered_entries()
        return self.snapshot()

    def snapshot(self) -> ViewerSnapshot:
        return ViewerSnapshot(
            current_file=self.current_file,
            visible_entries=tuple(self.filtered_entries),
            selected_index=self.selected_index,
            total_entries=len(self.entries),
            chrome=self.chrome,
            active_filter=self.active_filter,
            active_view=self.saved_views.active_view(),
            find_state=FindState(
                query=self._find_query,
                match_count=len(self._find_matches),
                active_match_ordinal=self._active_find_match,
            ),
        )

    def open_file(self, path: str) -> ViewerSnapshot:
        snapshot, _changed = self._load_file(path, track_recent=True, force=True)
        return snapshot

    def reload_current_file(self, *, force: bool = True) -> ViewerSnapshot:
        if self.current_file is None:
            return self.snapshot()
        snapshot, _changed = self._load_file(self.current_file, track_recent=False, force=force)
        return snapshot

    def poll_current_file(self) -> tuple[ViewerSnapshot, bool]:
        if self.current_file is None:
            return self.snapshot(), False
        return self._load_file(self.current_file, track_recent=False, force=False)

    def toggle_favorite_current_file(self) -> None:
        if self.current_file is None:
            return
        path = Path(self.current_file)
        self.file_catalog.toggle_favorite(str(path), path.name or str(path))

    def apply_filter_spec(self, filter_spec: FilterSpec) -> ViewerSnapshot:
        self.active_filter = filter_spec
        self._refresh_filtered_entries()
        return self.snapshot()

    def toggle_excluded_level(self, level: LogLevel) -> ViewerSnapshot:
        exclude_levels = set(self.active_filter.exclude_levels)
        if level in exclude_levels:
            exclude_levels.remove(level)
        else:
            exclude_levels.add(level)
        return self._with_updated_filter(exclude_levels=frozenset(exclude_levels))

    def toggle_excluded_category(self, category: str) -> ViewerSnapshot:
        exclude_categories = set(self.active_filter.exclude_categories)
        if category in exclude_categories:
            exclude_categories.remove(category)
        else:
            exclude_categories.add(category)
        return self._with_updated_filter(exclude_categories=frozenset(exclude_categories))

    def exclude_selected_category(self) -> ViewerSnapshot:
        entry = self.selected_entry()
        if entry is None or not entry.category:
            return self.snapshot()
        return self.toggle_excluded_category(entry.category)

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

    def toggle_excluded_selected_level(self) -> ViewerSnapshot:
        entry = self.selected_entry()
        if entry is None or entry.level is None:
            return self.snapshot()
        return self.toggle_excluded_level(entry.level)

    def start_find(self, query: str) -> ViewerSnapshot:
        self._find_query = query.strip() or None
        self._refresh_find_matches()
        return self.snapshot()

    def clear_find(self) -> ViewerSnapshot:
        self._find_query = None
        self._refresh_find_matches()
        return self.snapshot()

    def _move_find(self, step: int) -> ViewerSnapshot:
        if not self._find_matches:
            return self.snapshot()

        if self._active_find_match <= 0:
            self._active_find_match = 1
        else:
            self._active_find_match = ((self._active_find_match - 1 + step) % len(self._find_matches)) + 1
        self.selected_index = self._find_matches[self._active_find_match - 1]
        return self.snapshot()

    def find_next(self) -> ViewerSnapshot:
        return self._move_find(1)

    def find_previous(self) -> ViewerSnapshot:
        return self._move_find(-1)

    def time_filter_context(self) -> TimeFilterContext:
        selected = self.selected_entry()
        if selected and selected.timestamp:
            return TimeFilterContext(reference_date=selected.timestamp.date())

        for entry in self.entries:
            if entry.timestamp:
                return TimeFilterContext(reference_date=entry.timestamp.date())
        return TimeFilterContext(reference_date=None)
