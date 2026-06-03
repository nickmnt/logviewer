from __future__ import annotations

from collections.abc import Iterable

from .models import FilterSpec, LogEntry


def entry_contains_text(entry: LogEntry, text_query: str) -> bool:
    needle = text_query.casefold()
    haystacks = [entry.message, entry.raw]
    if entry.category:
        haystacks.append(entry.category)
    return any(needle in haystack.casefold() for haystack in haystacks)


def matches_filter(entry: LogEntry, filter_spec: FilterSpec) -> bool:
    if filter_spec.include_levels and entry.level not in filter_spec.include_levels:
        return False

    if filter_spec.exclude_levels and entry.level in filter_spec.exclude_levels:
        return False

    if filter_spec.include_categories and entry.category not in filter_spec.include_categories:
        return False

    if filter_spec.exclude_categories and entry.category in filter_spec.exclude_categories:
        return False

    if filter_spec.text_query and not entry_contains_text(entry, filter_spec.text_query):
        return False

    if filter_spec.start_time is not None:
        if entry.timestamp is None or entry.timestamp < filter_spec.start_time:
            return False

    if filter_spec.end_time is not None:
        if entry.timestamp is None or entry.timestamp > filter_spec.end_time:
            return False

    return True


def apply_filter(entries: Iterable[LogEntry], filter_spec: FilterSpec) -> list[LogEntry]:
    return [entry for entry in entries if matches_filter(entry, filter_spec)]
