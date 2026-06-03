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


def test_parse_nlog_line_normalizes_mixed_case_level() -> None:
    entry = parse_nlog_line("2026-06-03 09:14:27.1234|error|Category1|boom")

    assert entry.is_parsed is True
    assert entry.level == LogLevel.ERROR
    assert entry.message == "boom"


def test_parse_nlog_line_allows_extra_pipes_inside_message() -> None:
    entry = parse_nlog_line("2026-06-03 09:14:27.1234|INFO|Category1|part1|part2|part3")

    assert entry.is_parsed is True
    assert entry.level == LogLevel.INFO
    assert entry.message == "part1|part2|part3"


def test_parse_nlog_line_falls_back_to_raw_for_invalid_timestamp_with_valid_delimiters() -> None:
    raw_line = "not-a-time|INFO|Category1|message"

    entry = parse_nlog_line(raw_line)

    assert entry.is_parsed is False
    assert entry.message == raw_line
