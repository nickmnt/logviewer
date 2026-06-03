import pytest
from textual.widgets import DataTable, Input, ListView, Static

from logviewer.app import LogViewerApp


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
