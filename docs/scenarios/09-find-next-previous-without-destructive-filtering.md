# Scenario 09: Find Next / Previous Without Destructive Filtering

## Goal

Let the user search within the current log view quickly without replacing or rebuilding the active filter set.

## Primary User Story

As an engineer scanning a noisy log, I want to find a word or phrase, jump between matches, and keep my current filters intact so I can investigate without losing context.

## Acceptance Criteria

- Find is a first-class interaction separate from the persistent filter editor.
- The user can open a compact find input, type a query, and jump to the first visible match.
- The user can jump to the next and previous matches without reopening the find UI.
- Find operates on the currently visible entries after filters are applied.
- Find does not overwrite saved views or the active filter specification.
- The current match position is visible in a compact form such as `2/7`.
- Closing find clears transient match navigation state without disturbing the active filters.

## Notes for Implementation

- Mature log viewers usually separate long-lived filters from short-lived search.
- The hot path should avoid a full table rebuild when only the active match changes.
