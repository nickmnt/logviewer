# Scenario 10: Detail Toggle Preserves Reading Position

## Goal

Let the user inspect the selected log line in more detail without losing reading context or causing layout jitter.

## Primary User Story

As an engineer stepping through live or historical logs, I want `Enter` to reveal details for the selected row without pushing that row to the bottom of the viewport or forcing me to reacquire visual context.

## Acceptance Criteria

- Pressing `Enter` reveals or hides details for the selected log row.
- Toggling details does not rebuild the visible row model when only chrome visibility changes.
- Toggling details preserves the current selection.
- Toggling details preserves the current scroll anchor when the selected row already fits in view.
- The detail surface stays easy to dismiss and does not require a separate navigation flow.
- The detail surface stays out of the way when hidden so daily reading remains uncluttered.

## Notes for Implementation

- Mature log viewers treat details as transient chrome, not as a reason to repopulate the backing list widget.
- A floating drawer, overlay, or non-reflowing pane is preferable to a layout change that shrinks the main list on every toggle.
