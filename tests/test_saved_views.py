from datetime import datetime

from logviewer.models import FilterSpec, LogLevel
from logviewer.saved_views import SavedViewStore


def test_saved_view_stores_named_filter_and_can_be_switched() -> None:
    store = SavedViewStore()
    quiet_backend = store.save(
        "quiet-backend",
        FilterSpec(
            exclude_levels=frozenset({LogLevel.TRACE}),
            exclude_categories=frozenset({"Microsoft.Hosting.Lifetime"}),
            start_time=datetime(2026, 6, 3, 9, 0, 0),
        ),
    )
    noisy_trace = store.save(
        "trace-everything",
        FilterSpec(include_levels=frozenset({LogLevel.TRACE})),
    )

    assert quiet_backend.name == "quiet-backend"
    assert noisy_trace.name == "trace-everything"

    store.activate("quiet-backend")
    assert store.active_view() == quiet_backend

    store.activate("trace-everything")
    assert store.active_view() == noisy_trace


def test_saved_view_can_be_disabled_without_being_deleted() -> None:
    store = SavedViewStore()
    store.save(
        "focus-errors",
        FilterSpec(include_levels=frozenset({LogLevel.ERROR, LogLevel.FATAL})),
    )

    disabled = store.disable("focus-errors")

    assert disabled.name == "focus-errors"
    assert disabled.enabled is False


def test_saved_views_persist_and_restore_active_view(tmp_path) -> None:
    storage_path = tmp_path / "saved-views.json"
    first = SavedViewStore(storage_path)
    first.save(
        "quiet-backend",
        FilterSpec(exclude_levels=frozenset({LogLevel.TRACE})),
    )
    first.activate("quiet-backend")

    second = SavedViewStore(storage_path)
    restored = second.active_view()

    assert restored is not None
    assert restored.name == "quiet-backend"
    assert restored.filter_spec.exclude_levels == frozenset({LogLevel.TRACE})


def test_saved_views_ignore_malformed_storage_payload(tmp_path) -> None:
    storage_path = tmp_path / "saved-views.json"
    storage_path.write_text("{not valid json")

    store = SavedViewStore(storage_path)

    assert store.list_views() == []
    assert store.active_view() is None
