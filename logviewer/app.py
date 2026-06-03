from __future__ import annotations

from datetime import datetime
from pathlib import Path

from textual import on
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container, Horizontal, Vertical
from textual.screen import ModalScreen
from textual.widgets import Button, DataTable, Footer, Header, Input, Label, ListItem, ListView, Static

from .controller import ViewerController
from .models import FilterSpec, LogLevel, SavedView


LEVEL_ORDER = [LogLevel.TRACE, LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL]


def _parse_csv_values(value: str) -> frozenset[str]:
    return frozenset(item.strip() for item in value.split(",") if item.strip())


def _parse_levels(value: str) -> frozenset[LogLevel]:
    levels = []
    for item in _parse_csv_values(value):
        levels.append(LogLevel(item.upper()))
    return frozenset(levels)


def _parse_optional_datetime(value: str) -> datetime | None:
    stripped = value.strip()
    if not stripped:
        return None
    return datetime.fromisoformat(stripped)


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
                yield Button("Cancel", id="cancel-open")

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

    @on(Button.Pressed, "#cancel-open")
    def cancel_open(self) -> None:
        self.dismiss(None)


class FilterScreen(ModalScreen[object]):
    BINDINGS = [Binding("escape", "dismiss(None)", "Close")]

    def __init__(self, filter_spec: FilterSpec) -> None:
        super().__init__()
        self.filter_spec = filter_spec

    def compose(self) -> ComposeResult:
        with Container(id="modal"):
            yield Label("Filters", id="modal-title")
            yield Static("Leave fields blank to keep them open. Datetimes use ISO format.", classes="modal-copy")
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
                    placeholder="Start time",
                    id="start-time",
                )
                yield Input(
                    value=self.filter_spec.end_time.isoformat(sep=' ') if self.filter_spec.end_time else "",
                    placeholder="End time",
                    id="end-time",
                )
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
            start_time=_parse_optional_datetime(self.query_one("#start-time", Input).value),
            end_time=_parse_optional_datetime(self.query_one("#end-time", Input).value),
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
        height: 1fr;
        background: #0f1620;
        border: round #26445c;
    }

    #detail {
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
        Binding("v", "saved_views", "Views", priority=True),
        Binding("r", "reload_file", "Reload", priority=True),
        Binding("space", "toggle_follow", "Pause Follow", priority=True),
        Binding("enter", "toggle_detail", "Details", priority=True),
        Binding("star", "toggle_favorite", "Favorite", priority=True),
        Binding("j,down", "move_down", "Down", show=False),
        Binding("k,up", "move_up", "Up", show=False),
    ]

    def __init__(self, initial_path: str | None = None) -> None:
        super().__init__()
        self.initial_path = initial_path
        self.controller = ViewerController()
        self.follow_interval = 1.0

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Vertical(id="body"):
            yield Static("No file loaded. Press o to open a log file.", id="summary")
            with Container(id="table-wrap"):
                yield DataTable(id="log-table")
                yield Static(
                    "Open a log file with o. Then use f for filters, v for saved views, Enter for details, and Space to pause follow mode.",
                    id="empty-state",
                )
            yield Static("", id="detail")
        yield Footer()

    def on_mount(self) -> None:
        table = self.query_one(DataTable)
        table.add_columns("Time", "Level", "Category", "Message")
        detail = self.query_one("#detail", Static)
        detail.display = False
        self.set_interval(self.follow_interval, self._refresh_follow_mode)
        if self.initial_path:
            self.controller.open_file(self.initial_path)
            self._sync_view()

    def _refresh_follow_mode(self) -> None:
        snapshot = self.controller.snapshot()
        if snapshot.current_file and not snapshot.chrome.paused:
            self.controller.reload_current_file()
            self._sync_view()

    def _sync_view(self) -> None:
        snapshot = self.controller.snapshot()
        table = self.query_one(DataTable)
        table.clear()
        for entry in snapshot.visible_entries:
            timestamp = entry.timestamp.strftime("%Y-%m-%d %H:%M:%S.%f")[:-2] if entry.timestamp else ""
            level = entry.level.value if entry.level else "RAW"
            category = entry.category or ""
            message = entry.message
            table.add_row(timestamp, level, category, message)

        empty_state = self.query_one("#empty-state", Static)
        empty_state.display = not snapshot.visible_entries
        if snapshot.visible_entries:
            table.cursor_coordinate = (snapshot.selected_index, 0)

        detail = self.query_one("#detail", Static)
        selected = self.controller.selected_entry()
        detail.update(selected.raw if selected else "No entry selected.")
        detail.display = snapshot.chrome.detail_visible

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
        token_text = " | ".join(tokens) if tokens else "no filters"
        return f"{file_name}{favorite_marker} | {count} | {state} | {token_text}"

    def _handle_open_result(self, path: object) -> None:
        if isinstance(path, str) and path:
            self.controller.open_file(path)
            self._sync_view()

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

    def action_open_file(self) -> None:
        candidates = [
            (record.path, record.label, record.is_favorite)
            for record in self.controller.file_catalog.open_candidates()
        ]
        self.push_screen(OpenLogScreen(candidates), self._handle_open_result)

    def action_edit_filters(self) -> None:
        self.push_screen(FilterScreen(self.controller.active_filter), self._handle_filter_result)

    def action_saved_views(self) -> None:
        self.push_screen(
            SavedViewsScreen(self.controller.saved_views.list_views()),
            self._handle_saved_view_result,
        )

    def action_reload_file(self) -> None:
        self.controller.reload_current_file()
        self._sync_view()

    def action_toggle_follow(self) -> None:
        self.controller.toggle_follow_pause()
        self._sync_view()

    def action_toggle_detail(self) -> None:
        self.controller.toggle_detail()
        self._sync_view()

    def action_toggle_favorite(self) -> None:
        self.controller.toggle_favorite_current_file()
        self._sync_view()

    def action_move_down(self) -> None:
        self.controller.move_selection(1)
        self._sync_view()

    def action_move_up(self) -> None:
        self.controller.move_selection(-1)
        self._sync_view()
