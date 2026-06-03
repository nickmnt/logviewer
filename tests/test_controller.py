from datetime import datetime

from logviewer.controller import ViewerController
from logviewer.models import FilterSpec, LogLevel


def test_controller_opens_file_and_updates_visible_entries(tmp_path) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text(
        "\n".join(
            [
                "2026-06-03 09:14:27.1234|TRACE|Category1|TheActualLog",
                "2026-06-03 09:15:00.0000|ERROR|Category2|Boom",
            ]
        )
    )
    controller = ViewerController()

    snapshot = controller.open_file(str(log_file))

    assert snapshot.current_file == str(log_file)
    assert snapshot.total_entries == 2
    assert [entry.message for entry in snapshot.visible_entries] == ["TheActualLog", "Boom"]


def test_controller_applies_saved_view_filter_to_existing_entries(tmp_path) -> None:
    log_file = tmp_path / "app.log"
    log_file.write_text(
        "\n".join(
            [
                "2026-06-03 09:14:27.1234|TRACE|Category1|trace",
                "2026-06-03 09:15:00.0000|ERROR|Category2|boom",
            ]
        )
    )
    controller = ViewerController()
    controller.open_file(str(log_file))
    controller.apply_filter_spec(
        FilterSpec(
            include_levels=frozenset({LogLevel.ERROR}),
            start_time=datetime(2026, 6, 3, 9, 15, 0),
        )
    )
    controller.save_view("errors-now")

    snapshot = controller.activate_saved_view("errors-now")

    assert snapshot.active_view is not None
    assert snapshot.active_view.name == "errors-now"
    assert [entry.message for entry in snapshot.visible_entries] == ["boom"]


def test_controller_tracks_overlay_detail_and_pause_state() -> None:
    controller = ViewerController()

    controller.show_overlay("filters")
    controller.toggle_detail()
    snapshot = controller.toggle_follow_pause()

    assert snapshot.chrome.active_overlay == "filters"
    assert snapshot.chrome.detail_visible is True
    assert snapshot.chrome.paused is True
