# Scenario 04: Time Scoping with Minimal UI Clutter

## Goal

Let the user constrain logs by time without turning the main viewer into a dashboard full of permanent controls.

## Primary User Story

As an engineer investigating a specific incident window, I want to narrow the visible logs to a start and end time so I can focus on the relevant period.

## Acceptance Criteria

- A filter can set a start time.
- A filter can set an end time.
- A filter can represent an open-ended range.
- Range filtering is inclusive for exact boundary timestamps.
- Time filters compose with level, category, and text filters.
- Active time filters are visible in a compact summary area.
- Editing time filters uses a transient input flow instead of a permanent panel.
- A beginner can type a partial time such as `09:15` or `09:15:30` without supplying a full ISO datetime.
- When the file context makes the day obvious, the app infers the date for partial time input instead of forcing the user to type it.
- The time UI offers quick ranges or presets for common incident windows such as "last 5m", "last 15m", or "this hour".
- Quick ranges are computed from log context rather than wall-clock time when the visible file is historical.
- Time-entry hints and examples use human-friendly inputs rather than ISO-only instructions.
- Invalid time input produces a clear correction path instead of silently doing nothing.

## Notes for Implementation

- Compact status summaries are preferable to always-visible control groups.
- Fast keyboard editing matters because incident response often happens under time pressure.
- Human-first time entry matters because many daily investigations start from "around 09:15" rather than a copy-pasted timestamp.
- Presets should be additive convenience, not a replacement for precise manual boundaries.
