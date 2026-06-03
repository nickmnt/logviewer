# Scenario 02: Parse Standard NLog Lines into Readable Columns

## Goal

Support the common structured text pattern of timestamp, level, category, and message so the TUI can present dense logs cleanly.

## Example Line

```text
2026-06-03 09:14:27.1234|TRACE|Category1|TheActualLog
```

## Primary User Story

As an engineer reading application logs, I want common NLog-style lines to be parsed into timestamp, level, category, and message fields so I can scan quickly and filter accurately.

## Acceptance Criteria

- The parser recognizes the four-pipe-field example format shown above.
- Timestamp is preserved with sub-second precision when present.
- Level is normalized for filtering and highlighting.
- Category is preserved exactly as emitted.
- Message retains the remaining text content after the final delimiter.
- Invalid or unmatched lines are not lost; they remain viewable as raw lines.
- Multi-line continuation behavior can be layered later without breaking the base single-line parse contract.

## Notes for Implementation

- Parsing should be resilient and cheap because it sits on the hot path for large files and follow mode.
- Raw fallback matters. Production logs often contain mixed formats during failures or startup.

