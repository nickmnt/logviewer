from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path

from rich.text import Text
from textual import events
from textual import on
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.css.query import NoMatches
from textual.containers import Container, Horizontal, Vertical
from textual.screen import ModalScreen
from textual.widgets import Button, DataTable, Footer, Header, Input, Label, ListItem, ListView, Static

from .controller import ViewerController, ViewerSnapshot
from .models import FilterSpec, LogLevel, SavedView, TimeFilterContext


LEVEL_ORDER = [LogLevel.TRACE, LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL]
LEVEL_COLORS = {
    LogLevel.TRACE: "#7f8ea3",
    LogLevel.DEBUG: "#4ea1ff",
    LogLevel.INFO: "#3ccf91",
    LogLevel.WARN: "#f4c95d",
    LogLevel.ERROR: "#ff7b72",
    LogLevel.FATAL: "#ff4d6d",
}


def _parse_csv_values(value: str) -> frozenset[str]:
    return frozenset(item.strip() for item in value.split(",") if item.strip())


def _parse_levels(value: str) -> frozenset[LogLevel]:
    levels = []
    for item in _parse_csv_values(value):
        levels.append(LogLevel(item.upper()))
    return frozenset(levels)


def _parse_optional_datetime(value: str, *, reference_date: date | None = None) -> datetime | None:
    stripped = value.strip()
    if not stripped:
        return None
    try:
        return datetime.fromisoformat(stripped)
    except ValueError:
        if reference_date is None:
            raise

    for pattern in ("%H:%M", "%H:%M:%S", "%H:%M:%S.%f"):
        try:
            parsed_time = datetime.strptime(stripped, pattern).time()
            return datetime.combine(reference_date, parsed_time)
        except ValueError:
            continue

    raise ValueError(f"Invalid datetime value: {value}")


def _render_level_cell(level: LogLevel | None) -> Text:
    if level is None:
        return Text("RAW", style="bold #9fb4c8")
    return Text(level.value, style=f"bold {LEVEL_COLORS[level]}")


class OpenLogScreen(ModalScreen[object]):
    BINDINGS = [Binding("escape", "dismiss(None)", "Close")]

    def __init__(self, candidates: list[tuple[str, str, bool]]) -> None:
        super().__init__()
        self.candidates = candidates

    def compose(self) -> ComposeResult:
        with Container(id="modal"):
            yield Label("Open log file", id="modal-title")
            yield Static("Type a path directly or pick a recent / favorite file.", classes="modal-copy")
            yield Input(placeholder="/path/to/app.log", id="open-path")
            yield ListView(
                *[
                    ListItem(
                        Label(f"{'★ ' if is_favorite else ''}{label}  [{path}]", markup=False),
                        id=f"candidate-{index}",
                    )
                    for index, (path, label, is_favorite) in enumerate(self.candidates)
                ],
                id="open-candidates",
            )
            with Horizontal(classes="button-row"):
                yield Button("Open", variant="primary", id="confirm-open")
                yield Button("Toggle favorite", id="toggle-open-favorite")
                yield Button("Cancel", id="cancel-open")

    def selected_candidate(self) -> tuple[str, str, bool] | None:
        selected = self.query_one("#open-candidates", ListView).highlighted_child
        if selected is None or selected.id is None:
            return None
        index = int(selected.id.rsplit("-", 1)[1])
        return self.candidates[index]

    @on(ListView.Selected, "#open-candidates")
    def handle_candidate_selected(self, event: ListView.Selected) -> None:
        if event.item is None:
            return
        try:
            index = int(event.item.id.rsplit("-", 1)[1])
        except (AttributeError, ValueError, IndexError):
            return
        path, _, _ = self.candidates[index]
        self.query_one("#open-path", Input).value = path

    @on(Button.Pressed, "#confirm-open")
    def confirm_open(self) -> None:
        self.dismiss(self.query_one("#open-path", Input).value.strip() or None)

    @on(Button.Pressed, "#toggle-open-favorite")
    def toggle_favorite_candidate(self) -> None:
        selected = self.selected_candidate()
        if selected is None:
            return
        path, label, _is_favorite = selected
        self.dismiss(("favorite", path, label))

    @on(Button.Pressed, "#cancel-open")
    def cancel_open(self) -> None:
        self.dismiss(None)


class FilterScreen(ModalScreen[object]):
    BINDINGS = [Binding("escape", "dismiss(None)", "Close")]

    def __init__(self, filter_spec: FilterSpec, time_context: TimeFilterContext | None = None) -> None:
        super().__init__()
        self.filter_spec = filter_spec
        self.time_context = time_context or TimeFilterContext()

    def compose(self) -> ComposeResult:
        with Container(id="modal"):
            yield Label("Filters", id="modal-title")
            yield Static(
                "Leave fields blank to keep them open. Time examples: 09:15, 09:15:30, or 2026-06-03 09:15.",
                classes="modal-copy",
            )
            with Horizontal(classes="field-row"):
                yield Input(
                    value=",".join(level.value for level in sorted(self.filter_spec.include_levels, key=lambda item: item.value)),
                    placeholder="Include levels",
                    id="include-levels",
                )
                yield Input(
                    value=",".join(level.value for level in sorted(self.filter_spec.exclude_levels, key=lambda item: item.value)),
                    placeholder="Exclude levels",
                    id="exclude-levels",
                )
            with Horizontal(classes="field-row"):
                yield Input(
                    value=",".join(sorted(self.filter_spec.include_categories)),
                    placeholder="Include categories",
                    id="include-categories",
                )
                yield Input(
                    value=",".join(sorted(self.filter_spec.exclude_categories)),
                    placeholder="Exclude categories",
                    id="exclude-categories",
                )
            yield Input(value=self.filter_spec.text_query or "", placeholder="Search text", id="text-query")
            with Horizontal(classes="field-row"):
                yield Input(
                    value=self.filter_spec.start_time.isoformat(sep=' ') if self.filter_spec.start_time else "",
                    placeholder="Start time, e.g. 09:15",
                    id="start-time",
                )
                yield Input(
                    value=self.filter_spec.end_time.isoformat(sep=' ') if self.filter_spec.end_time else "",
                    placeholder="End time, e.g. 09:30",
                    id="end-time",
                )
            with Horizontal(classes="button-row"):
                yield Button("Last 5m", id="preset-last-5m")
                yield Button("Last 15m", id="preset-last-15m")
                yield Button("This hour", id="preset-this-hour")
            with Horizontal(classes="button-row"):
                yield Button("Apply", variant="primary", id="apply-filter")
                yield Button("Clear", id="clear-filter")
                yield Button("Cancel", id="cancel-filter")

    def _build_filter_spec(self) -> FilterSpec:
        return FilterSpec(
            include_levels=_parse_levels(self.query_one("#include-levels", Input).value),
            exclude_levels=_parse_levels(self.query_one("#exclude-levels", Input).value),
            include_categories=_parse_csv_values(self.query_one("#include-categories", Input).value),
            exclude_categories=_parse_csv_values(self.query_one("#exclude-categories", Input).value),
            text_query=self.query_one("#text-query", Input).value.strip() or None,
            start_time=_parse_optional_datetime(
                self.query_one("#start-time", Input).value,
                reference_date=self.time_context.reference_date,
            ),
            end_time=_parse_optional_datetime(
                self.query_one("#end-time", Input).value,
                reference_date=self.time_context.reference_date,
            ),
        )

    def _build_non_time_filter_spec(self) -> FilterSpec:
        return FilterSpec(
            include_levels=_parse_levels(self.query_one("#include-levels", Input).value),
            exclude_levels=_parse_levels(self.query_one("#exclude-levels", Input).value),
            include_categories=_parse_csv_values(self.query_one("#include-categories", Input).value),
            exclude_categories=_parse_csv_values(self.query_one("#exclude-categories", Input).value),
            text_query=self.query_one("#text-query", Input).value.strip() or None,
        )

    def _build_preset_filter_spec(self, *, start_time: datetime, end_time: datetime) -> FilterSpec:
        base_filter = self._build_non_time_filter_spec()
        return FilterSpec(
            include_levels=base_filter.include_levels,
            exclude_levels=base_filter.exclude_levels,
            include_categories=base_filter.include_categories,
            exclude_categories=base_filter.exclude_categories,
            text_query=base_filter.text_query,
            start_time=start_time,
            end_time=end_time,
        )

    def _preset_anchor(self) -> datetime | None:
        return self.time_context.latest_timestamp

    @on(Button.Pressed, "#preset-last-5m")
    def apply_last_5_minutes(self) -> None:
        anchor = self._preset_anchor()
        if anchor is None:
            return
        self.dismiss(self._build_preset_filter_spec(start_time=anchor - timedelta(minutes=5), end_time=anchor))

    @on(Button.Pressed, "#preset-last-15m")
    def apply_last_15_minutes(self) -> None:
        anchor = self._preset_anchor()
        if anchor is None:
            return
        self.dismiss(self._build_preset_filter_spec(start_time=anchor - timedelta(minutes=15), end_time=anchor))

    @on(Button.Pressed, "#preset-this-hour")
    def apply_this_hour(self) -> None:
        anchor = self._preset_anchor()
        if anchor is None:
            return
        self.dismiss(
            self._build_preset_filter_spec(
                start_time=anchor.replace(minute=0, second=0, microsecond=0),
                end_time=anchor,
            )
        )

    @on(Button.Pressed, "#apply-filter")
    def apply_filter(self) -> None:
        self.dismiss(self._build_filter_spec())

    @on(Button.Pressed, "#clear-filter")
    def clear_filter(self) -> None:
        self.dismiss(FilterSpec())

    @on(Button.Pressed, "#cancel-filter")
    def cancel_filter(self) -> None:
        self.dismiss(None)


class SavedViewsScreen(ModalScreen[object]):
    BINDINGS = [Binding("escape", "dismiss(None)", "Close")]

    def __init__(self, views: list[SavedView]) -> None:
        super().__init__()
        self.views = views

    def compose(self) -> ComposeResult:
        with Container(id="modal"):
            yield Label("Saved views", id="modal-title")
            yield Static("Save the current filter or activate an existing saved view.", classes="modal-copy")
            yield Input(placeholder="New saved view name", id="view-name")
            yield ListView(
                *[
                    ListItem(
                        Label(f"{'●' if view.enabled else '○'} {view.name}", markup=False),
                        id=f"saved-view-{index}",
                    )
                    for index, view in enumerate(self.views)
                ],
                id="saved-view-list",
            )
            with Horizontal(classes="button-row"):
                yield Button("Save current", variant="primary", id="save-view")
                yield Button("Activate selected", id="activate-view")
                yield Button("Disable selected", id="disable-view")
                yield Button("Close", id="close-views")

    def _selected_view_name(self) -> str | None:
        selected = self.query_one("#saved-view-list", ListView).highlighted_child
        if selected is None or selected.id is None:
            return None
        index = int(selected.id.rsplit("-", 1)[1])
        return self.views[index].name

    @on(Button.Pressed, "#save-view")
    def save_view(self) -> None:
        name = self.query_one("#view-name", Input).value.strip()
        self.dismiss(("save", name) if name else None)

    @on(Button.Pressed, "#activate-view")
    def activate_view(self) -> None:
        name = self._selected_view_name()
        self.dismiss(("activate", name) if name else None)

    @on(Button.Pressed, "#disable-view")
    def disable_view(self) -> None:
        name = self._selected_view_name()
        self.dismiss(("disable", name) if name else None)

    @on(Button.Pressed, "#close-views")
    def close_views(self) -> None:
        self.dismiss(None)


class FindScreen(ModalScreen[object]):
    BINDINGS = [Binding("escape", "dismiss(None)", "Close")]

    def __init__(self, initial_query: str | None) -> None:
        super().__init__()
        self.initial_query = initial_query or ""

    def compose(self) -> ComposeResult:
        with Container(id="modal"):
            yield Label("Find", id="modal-title")
            yield Static("Search within the current visible rows. Use n / N to jump between matches.", classes="modal-copy")
            yield Input(value=self.initial_query, placeholder="Find text", id="find-query")
            with Horizontal(classes="button-row"):
                yield Button("Find", variant="primary", id="apply-find")
                yield Button("Clear", id="clear-find")
                yield Button("Cancel", id="cancel-find")

    @on(Button.Pressed, "#apply-find")
    def apply_find(self) -> None:
        self.dismiss(("find", self.query_one("#find-query", Input).value.strip()))

    @on(Button.Pressed, "#clear-find")
    def clear_find(self) -> None:
        self.dismiss(("clear", None))

    @on(Button.Pressed, "#cancel-find")
    def cancel_find(self) -> None:
        self.dismiss(None)


class LogTable(DataTable):
    def _on_mouse_move(self, event: events.MouseMove) -> None:
        # Hover-only row repainting is expensive on dense log tables and doesn't add much value.
        return

    async def _on_click(self, event: events.Click) -> None:
        await super()._on_click(event)
        if isinstance(self.app, LogViewerApp) and self.app._table_navigation_enabled():
            self.app.select_table_row(self.cursor_row)

    def action_cursor_down(self) -> None:
        if isinstance(self.app, LogViewerApp) and self.app._table_navigation_enabled():
            self.app.action_move_down()
            return
        super().action_cursor_down()

    def action_cursor_up(self) -> None:
        if isinstance(self.app, LogViewerApp) and self.app._table_navigation_enabled():
            self.app.action_move_up()
            return
        super().action_cursor_up()

    def action_page_down(self) -> None:
        if isinstance(self.app, LogViewerApp) and self.app._table_navigation_enabled():
            self.app.action_page_down()
            return
        super().action_page_down()

    def action_page_up(self) -> None:
        if isinstance(self.app, LogViewerApp) and self.app._table_navigation_enabled():
            self.app.action_page_up()
            return
        super().action_page_up()


class LogViewerApp(App[None]):
    CSS = """
    Screen {
        background: #11131a;
        color: #f1f3f8;
    }

    Header {
        background: #1e3a4c;
        color: #f7fbff;
    }

    Footer {
        background: #17202a;
        color: #d9e4f2;
    }

    #body {
        layout: vertical;
        height: 1fr;
    }

    #summary {
        height: 1;
        padding: 0 1;
        background: #18232f;
        color: #b8d5f0;
    }

    #table-wrap {
        layout: vertical;
        height: 1fr;
        background: #0f1620;
        border: round #26445c;
    }

    #detail {
        layer: overlay;
        dock: bottom;
        width: 1fr;
        height: 6;
        border-top: solid #26445c;
        padding: 0 1;
        background: #16212c;
        color: #dce9f7;
    }

    #empty-state {
        padding: 1 2;
        color: #aabacc;
    }

    #modal {
        width: 80;
        max-width: 92%;
        height: auto;
        max-height: 90%;
        padding: 1 2;
        border: round #3c6e91;
        background: #0e1722;
    }

    #modal-title {
        text-style: bold;
        color: #f7fbff;
        margin-bottom: 1;
    }

    .modal-copy {
        color: #9fb4c8;
        margin-bottom: 1;
    }

    Input {
        margin-bottom: 0;
    }

    ListView {
        height: 7;
        margin-bottom: 1;
        border: round #29425a;
    }

    .field-row {
        height: auto;
        margin-bottom: 1;
    }

    .button-row {
        height: auto;
        align-horizontal: right;
    }

    Button {
        margin-left: 1;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit", priority=True),
        Binding("o", "open_file", "Open", priority=True),
        Binding("f", "edit_filters", "Filters", priority=True),
        Binding("/", "find", "Find", priority=True),
        Binding("v", "saved_views", "Views", priority=True),
        Binding("r", "reload_file", "Reload", priority=True),
        Binding("space", "toggle_follow", "Pause Follow", priority=True),
        Binding("enter", "toggle_detail", "Details", priority=True),
        Binding("star", "toggle_favorite", "Favorite", priority=True),
        Binding("e", "exclude_level", "Hide Level", priority=True),
        Binding("x", "exclude_category", "Hide Category", priority=True),
        Binding("n", "find_next", "Next Match", priority=True),
        Binding("N", "find_previous", "Prev Match", priority=True),
        Binding("down", "move_down", "Down", show=False, priority=True),
        Binding("up", "move_up", "Up", show=False, priority=True),
        Binding("pagedown", "page_down", "Page Down", show=False, priority=True),
        Binding("pageup", "page_up", "Page Up", show=False, priority=True),
        Binding("home", "move_top", "Top", show=False, priority=True),
        Binding("end", "move_bottom", "Bottom", show=False, priority=True),
        Binding("j", "move_down", "Down", show=False),
        Binding("k", "move_up", "Up", show=False),
    ]

    def __init__(self, initial_path: str | None = None) -> None:
        super().__init__()
        self.initial_path = initial_path
        self.controller = ViewerController()
        self.follow_interval = 1.0
        self.max_rendered_rows = 500
        self._table_window_start = 0
        self._table_cursor_sync_in_progress = False

    def compose(self) -> ComposeResult:
        yield Header(show_clock=False)
        with Vertical(id="body"):
            yield Static("No file loaded. Press o to open a log file.", id="summary")
            with Container(id="table-wrap"):
                yield LogTable(id="log-table")
                yield Static(
                    "Open a log file with o. Then use f for filters, v for saved views, Enter for details, and Space to pause follow mode.",
                    id="empty-state",
                )
                yield Static("", id="detail")
        yield Footer()

    def on_mount(self) -> None:
        table = self.query_one(DataTable)
        table.cursor_type = "row"
        table.add_columns("Time", "Level", "Category", "Message")
        table.focus()
        detail = self.query_one("#detail", Static)
        detail.display = False
        self.set_interval(self.follow_interval, self._refresh_follow_mode)
        if self.initial_path:
            self.controller.open_file(self.initial_path)
            self._sync_view()

    def _refresh_follow_mode(self) -> None:
        snapshot = self.controller.snapshot()
        if snapshot.current_file and not snapshot.chrome.paused:
            _snapshot, changed = self.controller.poll_current_file()
            if changed:
                self._sync_view()

    def _sync_view(self) -> None:
        snapshot = self.controller.snapshot()
        self._sync_table(snapshot)
        self._sync_detail(snapshot)
        self._sync_summary()

    def _table_window_margin(self) -> int:
        return max(1, min(50, self.max_rendered_rows // 4))

    def _window_start_for_selection(self, snapshot: ViewerSnapshot) -> int:
        total_rows = len(snapshot.visible_entries)
        if total_rows <= self.max_rendered_rows:
            return 0

        max_start = total_rows - self.max_rendered_rows
        start = min(self._table_window_start, max_start)
        end = start + self.max_rendered_rows
        selection = snapshot.selected_index

        if selection < start or selection >= end:
            return min(max(selection - (self.max_rendered_rows // 2), 0), max_start)

        margin = min(self._table_window_margin(), self.max_rendered_rows // 2)
        if selection < start + margin:
            return max(0, min(selection - margin, max_start))

        if selection >= end - margin:
            return max(0, min(selection - self.max_rendered_rows + margin + 1, max_start))

        return start

    def _rendered_entries(self, snapshot: ViewerSnapshot) -> tuple[int, tuple]:
        start = self._window_start_for_selection(snapshot)
        end = start + self.max_rendered_rows
        return start, snapshot.visible_entries[start:end]

    def _sync_table(self, snapshot: ViewerSnapshot) -> None:
        try:
            table = self.query_one(DataTable)
        except NoMatches:
            return
        start, visible_window = self._rendered_entries(snapshot)
        self._table_window_start = start
        table.clear()
        table.add_rows(
            [
                (
                    entry.timestamp.strftime("%Y-%m-%d %H:%M:%S.%f")[:-2] if entry.timestamp else "",
                    _render_level_cell(entry.level),
                    entry.category or "",
                    entry.message,
                )
                for entry in visible_window
            ]
        )

        empty_state = self.query_one("#empty-state", Static)
        empty_state.display = not snapshot.visible_entries
        if snapshot.visible_entries:
            local_row = snapshot.selected_index - self._table_window_start
            self._table_cursor_sync_in_progress = True
            try:
                table.move_cursor(row=local_row, column=0, animate=False)
            finally:
                self._table_cursor_sync_in_progress = False

    def _sync_table_cursor(self, snapshot: ViewerSnapshot) -> bool:
        try:
            table = self.query_one(DataTable)
        except NoMatches:
            return False
        start = self._window_start_for_selection(snapshot)
        if start != self._table_window_start:
            self._sync_table(snapshot)
            return True

        if not snapshot.visible_entries:
            return False

        local_row = snapshot.selected_index - self._table_window_start
        self._table_cursor_sync_in_progress = True
        try:
            table.move_cursor(row=local_row, column=0, animate=False)
        finally:
            self._table_cursor_sync_in_progress = False
        return False

    def _sync_detail(self, snapshot: ViewerSnapshot | None = None) -> None:
        snapshot = snapshot or self.controller.snapshot()
        detail = self.query_one("#detail", Static)
        selected = self.controller.selected_entry()
        detail.update(selected.raw if selected else "No entry selected.")
        detail.display = snapshot.chrome.detail_visible

    def _sync_summary(self) -> None:
        self.query_one("#summary", Static).update(self._build_summary_text())

    def _build_summary_text(self) -> str:
        snapshot = self.controller.snapshot()
        file_name = Path(snapshot.current_file).name if snapshot.current_file else "No file"
        count = f"{len(snapshot.visible_entries)}/{snapshot.total_entries} lines"
        state = "paused" if snapshot.chrome.paused else "live"
        favorites = {
            candidate.path
            for candidate in self.controller.file_catalog.open_candidates()
            if candidate.is_favorite
        }
        favorite_marker = " ★" if snapshot.current_file in favorites else ""
        tokens = list(snapshot.chrome.summary_tokens)
        if snapshot.active_view:
            tokens.insert(0, f"view:{snapshot.active_view.name}")
        if snapshot.find_state.query:
            tokens.append(
                f"find:{snapshot.find_state.query} {snapshot.find_state.active_match_ordinal}/{snapshot.find_state.match_count}"
            )
        token_text = " | ".join(tokens) if tokens else "no filters"
        return f"{file_name}{favorite_marker} | {count} | {state} | {token_text}"

    def _handle_open_result(self, path: object) -> None:
        if isinstance(path, str) and path:
            self.controller.open_file(path)
            self._sync_view()
        elif isinstance(path, tuple) and len(path) == 3 and path[0] == "favorite":
            _action, candidate_path, label = path
            if isinstance(candidate_path, str) and isinstance(label, str):
                self.controller.file_catalog.toggle_favorite(candidate_path, label)
                self._sync_summary()
                self.action_open_file()

    def _handle_filter_result(self, filter_spec: object) -> None:
        if isinstance(filter_spec, FilterSpec):
            self.controller.apply_filter_spec(filter_spec)
            self._sync_view()

    def _handle_saved_view_result(self, result: object) -> None:
        if not isinstance(result, tuple) or len(result) != 2:
            return

        action, name = result
        if action == "save" and isinstance(name, str) and name:
            self.controller.save_view(name)
        elif action == "activate" and isinstance(name, str) and name:
            self.controller.activate_saved_view(name)
        elif action == "disable" and isinstance(name, str) and name:
            self.controller.saved_views.disable(name)
        self._sync_view()

    def _handle_find_result(self, result: object) -> None:
        if not isinstance(result, tuple) or len(result) != 2:
            return

        action, query = result
        if action == "find" and isinstance(query, str):
            self.controller.start_find(query)
        elif action == "clear":
            self.controller.clear_find()
        self._sync_view()

    def action_open_file(self) -> None:
        candidates = [
            (record.path, record.label, record.is_favorite)
            for record in self.controller.file_catalog.open_candidates()
        ]
        self.push_screen(OpenLogScreen(candidates), self._handle_open_result)

    def action_edit_filters(self) -> None:
        self.push_screen(
            FilterScreen(
                self.controller.active_filter,
                self.controller.time_filter_context(),
            ),
            self._handle_filter_result,
        )

    def action_find(self) -> None:
        self.push_screen(
            FindScreen(self.controller.snapshot().find_state.query),
            self._handle_find_result,
        )

    def action_saved_views(self) -> None:
        self.push_screen(
            SavedViewsScreen(self.controller.saved_views.list_views()),
            self._handle_saved_view_result,
        )

    def action_reload_file(self) -> None:
        self.controller.reload_current_file(force=True)
        self._sync_view()

    def action_toggle_follow(self) -> None:
        self.controller.toggle_follow_pause()
        self._sync_summary()

    def action_toggle_detail(self) -> None:
        snapshot = self.controller.toggle_detail()
        self._sync_detail(snapshot)

    def action_toggle_favorite(self) -> None:
        self.controller.toggle_favorite_current_file()
        self._sync_summary()

    def action_exclude_level(self) -> None:
        self.controller.toggle_excluded_selected_level()
        self._sync_view()

    def action_exclude_category(self) -> None:
        self.controller.exclude_selected_category()
        self._sync_view()

    def action_find_next(self) -> None:
        self.controller.find_next()
        self._sync_view()

    def action_find_previous(self) -> None:
        self.controller.find_previous()
        self._sync_view()

    def _table_navigation_enabled(self) -> bool:
        return not isinstance(self.screen, ModalScreen)

    def select_table_row(self, local_row: int) -> None:
        if not self._table_navigation_enabled():
            return
        snapshot = self.controller.set_selection(self._table_window_start + local_row)
        if self.query_one("#detail", Static).display:
            selected = self.controller.selected_entry()
            self.query_one("#detail", Static).update(selected.raw if selected else "No entry selected.")
        self._sync_table_cursor(snapshot)

    def _move_selection(self, delta: int) -> None:
        if not self._table_navigation_enabled():
            return
        snapshot = self.controller.move_selection(delta)
        self._sync_table_cursor(snapshot)
        if self.query_one("#detail", Static).display:
            selected = self.controller.selected_entry()
            self.query_one("#detail", Static).update(selected.raw if selected else "No entry selected.")

    def _set_selection(self, index: int) -> None:
        if not self._table_navigation_enabled():
            return
        snapshot = self.controller.set_selection(index)
        self._sync_table_cursor(snapshot)
        if self.query_one("#detail", Static).display:
            selected = self.controller.selected_entry()
            self.query_one("#detail", Static).update(selected.raw if selected else "No entry selected.")

    def action_move_down(self) -> None:
        self._move_selection(1)

    def action_move_up(self) -> None:
        self._move_selection(-1)

    def action_page_down(self) -> None:
        self._move_selection(self.max_rendered_rows - 1)

    def action_page_up(self) -> None:
        self._move_selection(-(self.max_rendered_rows - 1))

    def action_move_top(self) -> None:
        self._set_selection(0)

    def action_move_bottom(self) -> None:
        self._set_selection(len(self.controller.filtered_entries) - 1)
