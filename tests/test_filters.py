from datetime import datetime

from logviewer.filtering import apply_filter, matches_filter
from logviewer.models import FilterSpec, LogEntry, LogLevel


def test_filter_supports_level_category_and_text_rules() -> None:
    entry = LogEntry(
        raw="2026-06-03 09:14:27.1234|TRACE|Category1|TheActualLog",
        message="TheActualLog",
        timestamp=datetime(2026, 6, 3, 9, 14, 27, 123400),
        level=LogLevel.TRACE,
        category="Category1",
        is_parsed=True,
    )
    filter_spec = FilterSpec(
        include_levels=frozenset({LogLevel.TRACE, LogLevel.DEBUG}),
        exclude_categories=frozenset({"NoiseCategory"}),
        text_query="Actual",
    )

    assert matches_filter(entry, filter_spec) is True


def test_time_range_filter_is_inclusive_at_both_boundaries() -> None:
    entries = [
        LogEntry(
            raw="2026-06-03 09:14:27.1234|TRACE|Category1|Before",
            message="Before",
            timestamp=datetime(2026, 6, 3, 9, 14, 27, 123400),
            level=LogLevel.TRACE,
            category="Category1",
            is_parsed=True,
        ),
        LogEntry(
            raw="2026-06-03 09:15:00.0000|INFO|Category1|InsideStart",
            message="InsideStart",
            timestamp=datetime(2026, 6, 3, 9, 15, 0, 0),
            level=LogLevel.INFO,
            category="Category1",
            is_parsed=True,
        ),
        LogEntry(
            raw="2026-06-03 09:30:00.0000|ERROR|Category2|InsideEnd",
            message="InsideEnd",
            timestamp=datetime(2026, 6, 3, 9, 30, 0, 0),
            level=LogLevel.ERROR,
            category="Category2",
            is_parsed=True,
        ),
        LogEntry(
            raw="2026-06-03 09:30:00.0001|ERROR|Category2|After",
            message="After",
            timestamp=datetime(2026, 6, 3, 9, 30, 0, 100),
            level=LogLevel.ERROR,
            category="Category2",
            is_parsed=True,
        ),
    ]
    filter_spec = FilterSpec(
        start_time=datetime(2026, 6, 3, 9, 15, 0, 0),
        end_time=datetime(2026, 6, 3, 9, 30, 0, 0),
    )

    assert [entry.message for entry in apply_filter(entries, filter_spec)] == [
        "InsideStart",
        "InsideEnd",
    ]

