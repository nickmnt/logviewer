from .models import FilterSpec, UiChromeState


def default_chrome_state() -> UiChromeState:
    raise NotImplementedError("Implement chrome state behavior after the TDD suite is approved.")


def open_overlay(state: UiChromeState, overlay_name: str) -> UiChromeState:
    raise NotImplementedError("Implement chrome state behavior after the TDD suite is approved.")


def close_overlay(state: UiChromeState) -> UiChromeState:
    raise NotImplementedError("Implement chrome state behavior after the TDD suite is approved.")


def toggle_detail(state: UiChromeState) -> UiChromeState:
    raise NotImplementedError("Implement chrome state behavior after the TDD suite is approved.")


def pause_follow(state: UiChromeState) -> UiChromeState:
    raise NotImplementedError("Implement chrome state behavior after the TDD suite is approved.")


def summarize_filters(filter_spec: FilterSpec) -> tuple[str, ...]:
    raise NotImplementedError("Implement chrome state behavior after the TDD suite is approved.")

