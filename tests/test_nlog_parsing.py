from datetime import datetime

from logviewer.models import LogLevel
from logviewer.parsing import parse_nlog_line


def test_parse_nlog_line_splits_standard_four_column_format() -> None:
    entry = parse_nlog_line("2026-06-03 09:14:27.1234|TRACE|Category1|TheActualLog")

    assert entry.is_parsed is True
    assert entry.timestamp == datetime(2026, 6, 3, 9, 14, 27, 123400)
    assert entry.level == LogLevel.TRACE
    assert entry.category == "Category1"
    assert entry.message == "TheActualLog"
    assert entry.raw == "2026-06-03 09:14:27.1234|TRACE|Category1|TheActualLog"


def test_parse_nlog_line_keeps_unmatched_lines_viewable_as_raw() -> None:
    entry = parse_nlog_line("plain text that does not match the NLog pipe format")

    assert entry.is_parsed is False
    assert entry.timestamp is None
    assert entry.level is None
    assert entry.category is None
    assert entry.message == "plain text that does not match the NLog pipe format"
    assert entry.raw == "plain text that does not match the NLog pipe format"

