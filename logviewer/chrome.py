from __future__ import annotations

from .models import FilterSpec, UiChromeState


def default_chrome_state() -> UiChromeState:
    return UiChromeState(layout_mode="content_focus")


def open_overlay(state: UiChromeState, overlay_name: str) -> UiChromeState:
    return UiChromeState(
        layout_mode=state.layout_mode,
        active_overlay=overlay_name,
        detail_visible=state.detail_visible,
        follow_mode=state.follow_mode,
        paused=state.paused,
        summary_tokens=state.summary_tokens,
    )


def close_overlay(state: UiChromeState) -> UiChromeState:
    return UiChromeState(
        layout_mode=state.layout_mode,
        active_overlay=None,
        detail_visible=state.detail_visible,
        follow_mode=state.follow_mode,
        paused=state.paused,
        summary_tokens=state.summary_tokens,
    )


def toggle_detail(state: UiChromeState) -> UiChromeState:
    return UiChromeState(
        layout_mode=state.layout_mode,
        active_overlay=state.active_overlay,
        detail_visible=not state.detail_visible,
        follow_mode=state.follow_mode,
        paused=state.paused,
        summary_tokens=state.summary_tokens,
    )


def pause_follow(state: UiChromeState) -> UiChromeState:
    return UiChromeState(
        layout_mode=state.layout_mode,
        active_overlay=state.active_overlay,
        detail_visible=state.detail_visible,
        follow_mode=state.follow_mode,
        paused=not state.paused,
        summary_tokens=state.summary_tokens,
    )


def summarize_filters(filter_spec: FilterSpec) -> tuple[str, ...]:
    tokens: list[str] = []

    if filter_spec.include_levels:
        level_names = ",".join(level.value for level in sorted(filter_spec.include_levels, key=lambda item: item.value))
        tokens.append(f"lvl:{level_names}")

    if filter_spec.exclude_levels:
        level_names = ",".join(level.value for level in sorted(filter_spec.exclude_levels, key=lambda item: item.value))
        tokens.append(f"lvl:-{level_names}")

    if filter_spec.include_categories:
        category_names = ",".join(sorted(filter_spec.include_categories))
        tokens.append(f"cat:{category_names}")

    if filter_spec.exclude_categories:
        category_names = ",".join(sorted(filter_spec.exclude_categories))
        tokens.append(f"cat:-{category_names}")

    if filter_spec.text_query:
        tokens.append(f"text:{filter_spec.text_query}")

    if filter_spec.start_time:
        tokens.append(f"from:{filter_spec.start_time.strftime('%Y-%m-%d %H:%M:%S')}")

    if filter_spec.end_time:
        tokens.append(f"to:{filter_spec.end_time.strftime('%Y-%m-%d %H:%M:%S')}")

    return tuple(tokens)
