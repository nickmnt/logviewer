# Scenario 01: Daily Triage

## User story

An engineer opens a production log and wants to find active errors in under ten seconds without filling the screen with filter chrome.

## Flow

1. Open a recent log file or the sample log.
2. See a compact command deck with file state, entry counts, follow state, and active filter chips.
3. Use one action to focus error-heavy entries.
4. Move through results with the keyboard while keeping the details panel visible.
5. Hide one noisy category directly from the selected row.

## Expected experience

- The table remains the visual priority.
- Quick filters are visible but compact.
- Detail content updates instantly as selection changes.
- The list feels smooth while scrolling and when filters change.

## Acceptance criteria

- The app shows a readable command deck without opening an overlay.
- A focused severity control can switch between all entries and a narrow error-focused set.
- The selected row can exclude its level or category in one action.
- Active filters are summarized as removable chips.
- Empty states explain what to do next.
