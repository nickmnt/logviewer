# Scenario 03: Quick Filters, Saved Views, and Low-Friction Toggles

## Goal

Provide fast filtering by level, category, free text, and include/exclude rules, while keeping the interface unobtrusive.

## Primary User Story

As an engineer triaging noisy logs, I want to hide categories, focus on a subset of levels, and save reusable filter combinations so I can move between investigation contexts quickly.

## Acceptance Criteria

- A filter can include one or more levels.
- A filter can exclude one or more levels.
- A filter can include one or more categories.
- A filter can exclude one or more categories.
- A filter can match free-text query terms against message content.
- The user can exclude a level with a quick action instead of reopening a full editor and retyping the whole filter state.
- The user can exclude a category with a quick action from the selected row or a compact filter surface.
- Quick filter actions can be toggled off just as quickly as they were applied.
- A saved view stores a named combination of filter settings.
- Saved views can be enabled, disabled, and switched quickly.
- The compact summary area shows active include and exclude rules in a readable form.
- The app can expose quick toggles for common filters without keeping all controls on screen at once.

## Notes for Implementation

- Mature log viewers make common actions one keystroke away and uncommon actions discoverable through a transient control surface.
- Daily use favors "hide this noise" actions more than blank-slate filter construction, so exclusion flows should be especially fast.
- Saved views should be portable enough to survive restarts.
