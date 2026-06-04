# Scenario 04: Keyboard First Power Flow

## User story

A power user wants a terminal-like flow for moving, filtering, and finding matches while staying in a smooth React UI.

## Flow

1. Open the app and keep hands on the keyboard.
2. Use shortcuts to open file actions, filters, views, and find.
3. Navigate rows with `j`/`k`, arrows, page movement, and home/end.
4. Use transient find without overwriting persistent filters.
5. Toggle the detail panel and continue moving through entries.

## Expected experience

- Shortcuts never fight with focused text fields.
- Find state stays separate from filter state.
- Navigation keeps the selected row in view.

## Acceptance criteria

- Global shortcuts are ignored when an editable control is focused.
- Find results track the visible filtered entries.
- Next and previous find navigation wraps through matches.
- Selection stays clamped when filters reduce the result set.
- The list viewport auto-scrolls to keep the selected row visible.
