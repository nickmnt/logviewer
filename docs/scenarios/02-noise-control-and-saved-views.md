# Scenario 02: Noise Control And Saved Views

## User story

An engineer repeatedly suppresses known-noisy categories and wants those choices to persist as named working contexts.

## Flow

1. Open the filter workspace.
2. Exclude noisy categories from a suggested category list or by typing exact names.
3. Save the current filter set as a named view.
4. Return later and reactivate that view from a lightweight saved-view strip.
5. Temporarily disable the view without deleting it.

## Expected experience

- Saved views are first-class daily tools, not hidden settings.
- Common noise controls can be toggled without typing.
- Manual category entry is still available for precision work.

## Acceptance criteria

- The app can save the current filter set under a user-provided name.
- Saved views persist locally and can be reactivated later.
- Saved views can be disabled while remaining available.
- Category suggestions prefer frequent categories from the loaded file.
- Category include and exclude inputs normalize whitespace and duplicates.
