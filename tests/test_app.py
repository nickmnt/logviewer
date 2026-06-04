import asyncio

import pytest
from rich.text import Text
from textual.coordinate import Coordinate
from textual.widgets import DataTable, Header, Input, ListView, Static

from logviewer.app import LogTable, LogViewerApp


@pytest.mark.anyio
async def test_app_loads_initial_file_and_populates_table(tmp_path) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text(
        "\n".join(
            [
                "2026-06-03 09:14:27.1234|TRACE|Category1|TheActualLog",
                "2026-06-03 09:15:00.0000|ERROR|Category2|Boom",
            ]
        )
    )

    app = LogViewerApp(initial_path=str(log_file))
    async with app.run_test() as pilot:
        await pilot.pause()
        table = app.query_one(DataTable)
        summary = app.query_one("#summary", Static)

        assert table.row_count == 2
        assert "app.log" in summary.content


@pytest.mark.anyio
async def test_app_limits_rendered_rows_for_large_log_files(tmp_path) -> None:
    log_file = tmp_path / "large.log"
    log_file.write_text(
        "\n".join(
            [
                f"2026-06-03 09:14:{index:02d}.0000|INFO|Category{index}|message {index}"
                for index in range(40)
            ]
        )
    )

    app = LogViewerApp(initial_path=str(log_file))
    app.max_rendered_rows = 10
    async with app.run_test() as pilot:
        await pilot.pause()
        table = app.query_one(DataTable)
        summary = app.query_one("#summary", Static)

        assert table.row_count == 10
        assert table.get_row_at(0)[3] == "message 0"
        assert "40/40 lines" in summary.content


@pytest.mark.anyio
async def test_app_navigation_shifts_render_window_for_large_log_files(tmp_path) -> None:
    log_file = tmp_path / "large.log"
    log_file.write_text(
        "\n".join(
            [
                f"2026-06-03 09:14:{index:02d}.0000|INFO|Category{index}|message {index}"
                for index in range(40)
            ]
        )
    )

    app = LogViewerApp(initial_path=str(log_file))
    app.max_rendered_rows = 10
    async with app.run_test() as pilot:
        await pilot.pause()
        table = app.query_one(DataTable)

        for _ in range(12):
            app.action_move_down()
            await pilot.pause()

        assert app.controller.snapshot().selected_index == 12
        assert table.row_count == 10
        assert table.get_row_at(0)[3] == "message 5"
        assert table.cursor_coordinate.row == 7


@pytest.mark.anyio
async def test_app_opens_filter_modal_and_applies_text_filter(tmp_path) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text(
        "\n".join(
            [
                "2026-06-03 09:14:27.1234|TRACE|Category1|TheActualLog",
                "2026-06-03 09:15:00.0000|ERROR|Category2|Boom",
            ]
        )
    )

    app = LogViewerApp(initial_path=str(log_file))
    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.press("f")
        query = app.screen.query_one("#text-query", Input)
        query.value = "Boom"
        getattr(app.screen, "apply_filter")()
        await pilot.pause()

        table = app.query_one(DataTable)
        summary = app.query_one("#summary", Static)

        assert table.row_count == 1
        assert "text:Boom" in summary.content


@pytest.mark.anyio
async def test_app_toggles_detail_pane_for_selected_log(tmp_path) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text("2026-06-03 09:14:27.1234|TRACE|Category1|TheActualLog")

    app = LogViewerApp(initial_path=str(log_file))
    async with app.run_test() as pilot:
        await pilot.pause()
        detail = app.query_one("#detail", Static)
        assert detail.display is False

        await pilot.press("enter")
        await pilot.pause()

        assert detail.display is True
        assert "TheActualLog" in detail.content
        assert "Selected entry 1/1" in detail.content


@pytest.mark.anyio
async def test_app_uses_standard_semantic_colors_for_log_levels(tmp_path) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text(
        "\n".join(
            [
                "2026-06-03 09:14:27.1234|TRACE|Category1|trace",
                "2026-06-03 09:15:00.0000|ERROR|Category2|error",
            ]
        )
    )

    app = LogViewerApp(initial_path=str(log_file))
    async with app.run_test() as pilot:
        await pilot.pause()
        table = app.query_one(DataTable)

        trace_level = table.get_row_at(0)[1]
        error_level = table.get_row_at(1)[1]

        assert isinstance(trace_level, Text)
        assert trace_level.plain == "TRACE"
        assert trace_level.style == "bold #7f8ea3"
        assert isinstance(error_level, Text)
        assert error_level.plain == "ERROR"
        assert error_level.style == "bold #ff7b72"


@pytest.mark.anyio
async def test_app_detail_toggle_preserves_scroll_anchor_in_small_viewport(tmp_path) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text(
        "\n".join(
            [
                f"2026-06-03 09:14:{index:02d}.0000|INFO|Category{index}|message {index}"
                for index in range(30)
            ]
        )
    )

    app = LogViewerApp(initial_path=str(log_file))
    async with app.run_test(size=(100, 12)) as pilot:
        await pilot.pause()
        table = app.query_one(DataTable)

        for _ in range(12):
            await pilot.press("down")
            await pilot.pause()

        before_cursor_row = table.cursor_coordinate.row
        before_scroll_y = table.scroll_y
        before_height = table.scrollable_content_region.height

        await pilot.press("enter")
        await pilot.pause()

        detail = app.query_one("#detail", Static)

        assert detail.display is True
        assert table.cursor_coordinate.row == before_cursor_row
        assert table.scroll_y == before_scroll_y
        assert table.scrollable_content_region.height == before_height


@pytest.mark.anyio
async def test_app_detail_pane_opens_beside_table_without_covering_rows(tmp_path) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text(
        "\n".join(
            [
                f"2026-06-03 09:14:{index:02d}.0000|INFO|Category{index}|message {index}"
                for index in range(5)
            ]
        )
    )

    app = LogViewerApp(initial_path=str(log_file))
    async with app.run_test(size=(120, 18)) as pilot:
        await pilot.pause()
        table = app.query_one(DataTable)

        await pilot.press("enter")
        await pilot.pause()

        detail = app.query_one("#detail", Static)

        assert detail.display is True
        assert table.region.right <= detail.region.x


@pytest.mark.anyio
async def test_app_detail_toggle_does_not_force_full_view_sync(tmp_path, monkeypatch) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text(
        "\n".join(
            [
                "2026-06-03 09:14:27.1234|TRACE|Category1|one",
                "2026-06-03 09:15:00.0000|ERROR|Category2|two",
            ]
        )
    )

    app = LogViewerApp(initial_path=str(log_file))
    sync_calls: list[str] = []
    original_sync = app._sync_view

    def counting_sync() -> None:
        sync_calls.append("sync")
        original_sync()

    monkeypatch.setattr(app, "_sync_view", counting_sync)

    async with app.run_test() as pilot:
        await pilot.pause()
        initial_calls = len(sync_calls)

        await pilot.press("enter")
        await pilot.pause()

        assert len(sync_calls) == initial_calls


@pytest.mark.anyio
async def test_app_open_modal_prefills_selected_recent_path(tmp_path) -> None:
    first = tmp_path / "first.log"
    second = tmp_path / "second.log"
    first.write_text("2026-06-03 09:14:27.1234|TRACE|Category1|one")
    second.write_text("2026-06-03 09:14:27.1234|TRACE|Category1|two")

    app = LogViewerApp(initial_path=str(first))
    app.controller.file_catalog.add_recent(str(second), second.name)

    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.press("o")
        await pilot.pause()
        candidate_paths = list(getattr(app.screen, "candidates"))
        second_index = next(
            index for index, (path, _label, _is_favorite) in enumerate(candidate_paths) if path == str(second)
        )
        candidates = app.screen.query_one("#open-candidates", ListView)
        candidates.index = second_index
        candidates.action_select_cursor()
        await pilot.pause()

        path_input = app.screen.query_one("#open-path", Input)
        assert path_input.value == str(second)


@pytest.mark.anyio
async def test_app_open_modal_can_toggle_favorite_for_candidate_without_opening_it(tmp_path) -> None:
    first = tmp_path / "first.log"
    second = tmp_path / "second.log"
    first.write_text("2026-06-03 09:14:27.1234|TRACE|Category1|one")
    second.write_text("2026-06-03 09:14:27.1234|TRACE|Category1|two")

    app = LogViewerApp(initial_path=str(first))
    app.controller.file_catalog.add_recent(str(second), second.name)

    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.press("o")
        await pilot.pause()

        candidate_paths = list(getattr(app.screen, "candidates"))
        second_index = next(
            index for index, (path, _label, _is_favorite) in enumerate(candidate_paths) if path == str(second)
        )
        candidates = app.screen.query_one("#open-candidates", ListView)
        candidates.index = second_index
        candidates.action_select_cursor()
        await pilot.pause()

        getattr(app.screen, "toggle_favorite_candidate")()
        await pilot.pause()

        assert app.controller.snapshot().current_file == str(first)
        updated_candidates = app.controller.file_catalog.open_candidates()
        assert updated_candidates[0].path == str(second)
        assert updated_candidates[0].is_favorite is True


@pytest.mark.anyio
async def test_app_filter_modal_can_apply_last_15_minutes_preset_using_log_context(tmp_path) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text(
        "\n".join(
            [
                "2026-06-03 09:00:00.0000|TRACE|Category1|early",
                "2026-06-03 09:10:00.0000|INFO|Category2|inside",
                "2026-06-03 09:20:00.0000|ERROR|Category3|latest",
            ]
        )
    )

    app = LogViewerApp(initial_path=str(log_file))
    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.press("f")
        await pilot.pause()

        getattr(app.screen, "apply_last_15_minutes")()
        await pilot.pause()

        table = app.query_one(DataTable)
        summary = app.query_one("#summary", Static)

        assert table.row_count == 2
        assert "from:2026-06-03 09:05:00" in summary.content
        assert "to:2026-06-03 09:20:00" in summary.content


@pytest.mark.anyio
async def test_app_preserves_arrow_key_selection_across_follow_refresh(tmp_path) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text(
        "\n".join(
            [
                "2026-06-03 09:14:27.1234|TRACE|Category1|one",
                "2026-06-03 09:15:00.0000|ERROR|Category2|two",
                "2026-06-03 09:15:01.0000|INFO|Category3|three",
            ]
        )
    )

    app = LogViewerApp(initial_path=str(log_file))
    async with app.run_test() as pilot:
        await pilot.pause()
        table = app.query_one(DataTable)

        await pilot.press("down")
        await pilot.pause()
        assert table.cursor_coordinate.row == 1

        app._refresh_follow_mode()
        await pilot.pause()

        assert table.cursor_coordinate.row == 1
        assert app.controller.snapshot().selected_index == 1


@pytest.mark.anyio
async def test_app_pause_follow_blocks_reload_until_resumed(tmp_path) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text("2026-06-03 09:14:27.1234|TRACE|Category1|one")

    app = LogViewerApp(initial_path=str(log_file))
    async with app.run_test() as pilot:
        await pilot.pause()
        table = app.query_one(DataTable)
        assert table.row_count == 1

        await pilot.press("space")
        await pilot.pause()
        log_file.write_text(
            "\n".join(
                [
                    "2026-06-03 09:14:27.1234|TRACE|Category1|one",
                    "2026-06-03 09:15:00.0000|INFO|Category2|two",
                ]
            )
        )

        app._refresh_follow_mode()
        await pilot.pause()
        assert table.row_count == 1

        await pilot.press("space")
        await pilot.pause()
        app._refresh_follow_mode()
        await pilot.pause()

        assert table.row_count == 2


@pytest.mark.anyio
async def test_app_shows_empty_state_for_empty_file(tmp_path) -> None:
    log_file = tmp_path / "empty.log"
    log_file.write_text("")

    app = LogViewerApp(initial_path=str(log_file))
    async with app.run_test() as pilot:
        await pilot.pause()
        table = app.query_one(DataTable)
        empty_state = app.query_one("#empty-state", Static)

        assert table.row_count == 0
        assert empty_state.display is True


@pytest.mark.anyio
async def test_app_disables_live_clock_to_reduce_idle_repaints(tmp_path) -> None:
    log_file = tmp_path / "steady.log"
    log_file.write_text("2026-06-03 09:14:27.1234|TRACE|Category1|one")

    app = LogViewerApp(initial_path=str(log_file))
    async with app.run_test() as pilot:
        await pilot.pause()
        header = app.query_one(Header)

        assert header._show_clock is False


@pytest.mark.anyio
async def test_log_table_ignores_mouse_move_hover_updates_to_reduce_pointer_latency() -> None:
    asyncio.set_event_loop(asyncio.get_running_loop())
    table = LogTable()
    table.hover_coordinate = Coordinate(0, 0)

    class DummyStyle:
        meta = {"row": 5, "column": 1}

    class DummyEvent:
        style = DummyStyle()

    table._on_mouse_move(DummyEvent())

    assert table.hover_coordinate == Coordinate(0, 0)


@pytest.mark.anyio
async def test_app_follow_poll_skips_sync_when_file_is_unchanged(tmp_path, monkeypatch) -> None:
    log_file = tmp_path / "steady.log"
    log_file.write_text(
        "\n".join(
            [
                "2026-06-03 09:14:27.1234|TRACE|Category1|one",
                "2026-06-03 09:15:00.0000|INFO|Category2|two",
            ]
        )
    )
    app = LogViewerApp(initial_path=str(log_file))
    sync_calls: list[str] = []
    original_sync = app._sync_view

    def counting_sync() -> None:
        sync_calls.append("sync")
        original_sync()

    monkeypatch.setattr(app, "_sync_view", counting_sync)

    async with app.run_test() as pilot:
        await pilot.pause()
        initial_calls = len(sync_calls)

        app._refresh_follow_mode()
        await pilot.pause()

        assert len(sync_calls) == initial_calls


@pytest.mark.anyio
async def test_app_j_and_k_navigation_avoid_full_view_sync(tmp_path, monkeypatch) -> None:
    log_file = tmp_path / "nav.log"
    log_file.write_text(
        "\n".join(
            [
                "2026-06-03 09:14:27.1234|TRACE|Category1|one",
                "2026-06-03 09:15:00.0000|INFO|Category2|two",
                "2026-06-03 09:15:01.0000|WARN|Category3|three",
            ]
        )
    )
    app = LogViewerApp(initial_path=str(log_file))
    sync_calls: list[str] = []
    original_sync = app._sync_view

    def counting_sync() -> None:
        sync_calls.append("sync")
        original_sync()

    monkeypatch.setattr(app, "_sync_view", counting_sync)

    async with app.run_test() as pilot:
        await pilot.pause()
        table = app.query_one(DataTable)
        initial_calls = len(sync_calls)

        await pilot.press("j")
        await pilot.pause()
        await pilot.press("k")
        await pilot.pause()

        assert table.cursor_coordinate.row == 0
        assert len(sync_calls) == initial_calls


@pytest.mark.anyio
async def test_app_filter_modal_accepts_hh_mm_time_inputs_for_same_day_logs(tmp_path) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text(
        "\n".join(
            [
                "2026-06-03 09:14:27.1234|TRACE|Category1|Before",
                "2026-06-03 09:15:00.0000|INFO|Category1|InsideStart",
                "2026-06-03 09:30:00.0000|ERROR|Category2|InsideEnd",
                "2026-06-03 09:30:00.0001|ERROR|Category2|After",
            ]
        )
    )

    app = LogViewerApp(initial_path=str(log_file))
    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.press("f")
        query = app.screen.query_one("#start-time", Input)
        query.value = "09:15"
        app.screen.query_one("#end-time", Input).value = "09:30"
        getattr(app.screen, "apply_filter")()
        await pilot.pause()

        table = app.query_one(DataTable)
        summary = app.query_one("#summary", Static)

        assert table.row_count == 2
        assert "from:2026-06-03 09:15:00" in summary.content
        assert "to:2026-06-03 09:30:00" in summary.content


@pytest.mark.anyio
async def test_app_filter_modal_uses_beginner_friendly_time_hints(tmp_path) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text("2026-06-03 09:14:27.1234|TRACE|Category1|one")

    app = LogViewerApp(initial_path=str(log_file))
    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.press("f")
        await pilot.pause()

        modal_copy = app.screen.query_one(".modal-copy", Static)

        assert "09:15" in str(modal_copy.content)
        assert "ISO format" not in str(modal_copy.content)


@pytest.mark.anyio
async def test_app_quick_exclude_selected_category_hides_noise_without_opening_filters(tmp_path) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text(
        "\n".join(
            [
                "2026-06-03 09:14:27.1234|INFO|Noise.Category|chatty startup",
                "2026-06-03 09:15:00.0000|INFO|Core.Category|healthy",
            ]
        )
    )

    app = LogViewerApp(initial_path=str(log_file))
    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.press("x")
        await pilot.pause()

        table = app.query_one(DataTable)
        summary = app.query_one("#summary", Static)

        assert table.row_count == 1
        assert "cat:-Noise.Category" in str(summary.content)


@pytest.mark.anyio
async def test_app_find_modal_tracks_matches_inside_current_visible_rows(tmp_path) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text(
        "\n".join(
            [
                "2026-06-03 09:14:27.1234|INFO|Category1|timeout while connecting",
                "2026-06-03 09:15:00.0000|INFO|Category2|healthy",
                "2026-06-03 09:15:01.0000|ERROR|Category3|timeout while reading reply",
            ]
        )
    )

    app = LogViewerApp(initial_path=str(log_file))
    async with app.run_test() as pilot:
        await pilot.pause()
        await pilot.press("/")
        await pilot.pause()

        app.screen.query_one("#find-query", Input).value = "timeout"
        getattr(app.screen, "apply_find")()
        await pilot.pause()

        table = app.query_one(DataTable)
        summary = app.query_one("#summary", Static)
        assert table.cursor_coordinate.row == 0
        assert "find:timeout 1/2" in str(summary.content)

        await pilot.press("n")
        await pilot.pause()

        assert table.cursor_coordinate.row == 2
        assert "find:timeout 2/2" in str(summary.content)
