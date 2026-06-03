from .models import LogEntry


def parse_nlog_line(line: str) -> LogEntry:
    raise NotImplementedError("Implement NLog parsing after the TDD suite is approved.")

