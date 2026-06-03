# Scenario 08: Beginner-Safe Empty and Changing File States

## Goal

Make the viewer stable and understandable when files are empty, updated, or changed while the app is running.

## Primary User Story

As a beginner user, I want the viewer to behave predictably when a file changes underneath me so I can trust the tool without understanding its internal state model.

## Happy Path

- Opening a file with content shows rows immediately.
- Reloading the file after new lines arrive updates the visible row count.
- Compact status text reflects the current file, follow state, and active filters.

## Edge Cases

- Opening an empty file keeps the UI usable and uncluttered.
- Reload after file shrink keeps selection valid instead of crashing or pointing at a non-existent row.
- Detail view still works when the selected row changes because of filtering or file reload.

## Acceptance Criteria

- Empty-state behavior is test-covered.
- Reload after file growth and shrink is test-covered.
- Selection clamping after reload is test-covered.
