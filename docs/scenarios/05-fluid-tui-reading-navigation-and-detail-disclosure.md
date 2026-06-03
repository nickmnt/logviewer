# Scenario 05: Fluid TUI Reading, Navigation, and Detail Disclosure

## Goal

Create a log-reading experience that feels smooth under heavy use, surfaces details on demand, and avoids wasting screen real estate.

## Primary User Story

As an engineer reading a large live log stream, I want navigation and visual updates to remain smooth while detailed controls and expanded content stay out of the way until I ask for them.

## Acceptance Criteria

- The primary layout prioritizes the log table or list.
- Secondary controls are accessible through overlays, drawers, palettes, or focused panes rather than always occupying space.
- The UI model distinguishes between compact chrome and expanded control states.
- The app supports a detail disclosure pattern for the selected log line.
- Opening or closing detail disclosure does not cause the selected row to jump to the viewport edge when the visible log rows themselves have not changed.
- Follow mode can be paused without losing the current location.
- Search and "jump to next interesting line" are planned as first-class interactions.

## Notes for Implementation

- Best practice for smooth TUI work is minimizing unnecessary redraws, keeping input latency predictable, and separating hot-path state from infrequent UI state.
- Chrome-only changes such as showing details or changing summary text should avoid rebuilding the entire log table.
- The domain model should make it possible to unit test control-state changes without spinning up the full terminal UI.
