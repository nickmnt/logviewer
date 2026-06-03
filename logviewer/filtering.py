from collections.abc import Iterable

from .models import FilterSpec, LogEntry


def matches_filter(entry: LogEntry, filter_spec: FilterSpec) -> bool:
    raise NotImplementedError("Implement filtering after the TDD suite is approved.")


def apply_filter(entries: Iterable[LogEntry], filter_spec: FilterSpec) -> list[LogEntry]:
    raise NotImplementedError("Implement filtering after the TDD suite is approved.")

