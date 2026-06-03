from __future__ import annotations

from datetime import datetime

from .models import LogEntry, LogLevel


def _parse_timestamp(value: str) -> datetime | None:
    base, dot, fraction = value.partition(".")
    if not dot:
        try:
            return datetime.strptime(base, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return None

    if not fraction.isdigit():
        return None

    padded_fraction = (fraction + "000000")[:6]
    normalized = f"{base}.{padded_fraction}"
    try:
        return datetime.strptime(normalized, "%Y-%m-%d %H:%M:%S.%f")
    except ValueError:
        return None


def parse_nlog_line(line: str) -> LogEntry:
    raw = line.rstrip("\n")
    parts = raw.split("|", 3)
    if len(parts) != 4:
        return LogEntry(raw=raw, message=raw)

    timestamp_text, level_text, category, message = parts
    timestamp = _parse_timestamp(timestamp_text.strip())
    normalized_level = level_text.strip().upper()
    try:
        level = LogLevel(normalized_level)
    except ValueError:
        level = None

    if timestamp is None or level is None:
        return LogEntry(raw=raw, message=raw)

    return LogEntry(
        raw=raw,
        message=message,
        timestamp=timestamp,
        level=level,
        category=category,
        is_parsed=True,
    )
