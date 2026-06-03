# Scenario 06: Live Follow Must Not Steal Selection

## Goal

Keep the operator's reading position stable while follow mode refreshes the file in the background.

## Primary User Story

As an engineer reading a live log, I want to move down to an interesting line and keep that selection even while the viewer refreshes, so the UI does not fight my navigation.

## Happy Path

- The user opens a log file with multiple rows.
- The user moves the selection with arrow keys or `j` / `k`.
- Follow mode refreshes the file contents.
- The highlighted row remains on the same logical entry index when that index still exists.

## Edge Cases

- If the file grows, the current selection remains where it was unless the user explicitly moves again.
- If the file shrinks below the selected row, the selection clamps to the last available row.
- If follow mode is paused, refresh does not reload the file until follow is resumed.
- Table-owned cursor movement and controller-owned selection state stay synchronized.

## Acceptance Criteria

- Background refresh never snaps the selection back to the first row unless only one row remains.
- Arrow-key navigation updates the domain state used by follow refresh.
- Pause and resume follow mode are test-covered, including file growth while paused.
- Follow polling does nothing when the file has not changed on disk.
- No-op follow polling does not rebuild the table or disturb viewport position.
