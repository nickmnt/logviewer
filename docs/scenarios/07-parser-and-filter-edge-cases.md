# Scenario 07: Parser and Filter Edge Cases

## Goal

Handle the messy inputs found in production logs without losing visibility or breaking filters.

## Primary User Story

As an engineer reading mixed-quality logs, I want malformed or surprising lines to remain visible and predictable so I can still investigate failures when the log format degrades.

## Happy Path

- Standard NLog rows parse into timestamp, level, category, and message.
- Lowercase or mixed-case levels normalize correctly.
- Messages may contain additional pipe characters after the third delimiter.

## Edge Cases

- A line with valid delimiters but an invalid timestamp falls back to raw display.
- A line with valid delimiters but an unknown level falls back to raw display.
- Raw lines are excluded from time-scoped filters because they have no timestamp.
- Free-text filtering can still match raw entries through their raw or message content.

## Acceptance Criteria

- Parser behavior is specified with tests for normalized levels, extra pipes, and malformed structured rows.
- Filter behavior is specified with tests for raw-line handling under time and text filtering.

