from datetime import datetime

from logviewer.chrome import (
    default_chrome_state,
    open_overlay,
    pause_follow,
    summarize_filters,
    toggle_detail,
)
from logviewer.models import FilterSpec, LogLevel


def test_default_chrome_is_content_focused_and_uncluttered() -> None:
    state = default_chrome_state()

    assert state.layout_mode == "content_focus"
    assert state.active_overlay is None
    assert state.detail_visible is False
    assert state.summary_tokens == ()


def test_filter_overlay_is_transient_and_does_not_change_primary_layout_mode() -> None:
    state = default_chrome_state()

    overlay_state = open_overlay(state, "filters")

    assert overlay_state.layout_mode == "content_focus"
    assert overlay_state.active_overlay == "filters"


def test_detail_toggle_and_follow_pause_are_modeled_explicitly() -> None:
    state = default_chrome_state()

    detail_state = toggle_detail(state)
    paused_state = pause_follow(detail_state)

    assert detail_state.detail_visible is True
    assert paused_state.paused is True


def test_active_filters_have_a_compact_summary_for_low_clutter_ui() -> None:
    summary = summarize_filters(
        FilterSpec(
            include_levels=frozenset({LogLevel.ERROR}),
            exclude_categories=frozenset({"NoiseCategory"}),
            start_time=datetime(2026, 6, 3, 9, 15, 0),
        )
    )

    assert summary == ("lvl:ERROR", "cat:-NoiseCategory", "from:2026-06-03 09:15:00")
