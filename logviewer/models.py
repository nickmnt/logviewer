from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class LogLevel(str, Enum):
    TRACE = "TRACE"
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"
    FATAL = "FATAL"


@dataclass(frozen=True)
class LogEntry:
    raw: str
    message: str
    timestamp: datetime | None = None
    level: LogLevel | None = None
    category: str | None = None
    is_parsed: bool = False


@dataclass(frozen=True)
class FilterSpec:
    include_levels: frozenset[LogLevel] = field(default_factory=frozenset)
    exclude_levels: frozenset[LogLevel] = field(default_factory=frozenset)
    include_categories: frozenset[str] = field(default_factory=frozenset)
    exclude_categories: frozenset[str] = field(default_factory=frozenset)
    text_query: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None


@dataclass(frozen=True)
class SavedView:
    name: str
    filter_spec: FilterSpec
    enabled: bool = True


@dataclass(frozen=True)
class FileRecord:
    path: str
    label: str
    is_favorite: bool = False


@dataclass(frozen=True)
class UiChromeState:
    layout_mode: str = "content_focus"
    active_overlay: str | None = None
    detail_visible: bool = False
    follow_mode: bool = False
    paused: bool = False
    summary_tokens: tuple[str, ...] = ()

