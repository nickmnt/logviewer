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

## Notes for Implementation

- Compact status summaries are preferable to always-visible control groups.
- Fast keyboard editing matters because incident response often happens under time pressure.

