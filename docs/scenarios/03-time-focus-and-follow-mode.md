# Scenario 03: Time Focus And Follow Mode

## User story

An engineer tailing a live log wants to isolate the current spike without losing the ability to follow incoming lines.

## Flow

1. Open a live file handle.
2. Keep follow mode running while the file updates.
3. Apply a recent time window such as last five minutes.
4. Pause follow mode to inspect a burst of events.
5. Resume follow mode and continue from the newest entries.

## Expected experience

- Follow mode status is always visible.
- Time windows are quick actions, not manual text entry only.
- Pausing follow mode does not clear filters or selection context.

## Acceptance criteria

- Recent-range quick actions set start and end times from the latest visible log timestamp.
- Human-friendly time input accepts partial clock values when a reference date exists.
- Follow mode can be paused and resumed without losing the loaded file.
- Reload and follow state changes update the status message clearly.
