# Scenario 01: Open, Follow, and Favorite Log Files

## Goal

Let an operator open a log file in one step, start following it immediately when useful, and favorite commonly used paths without cluttering the main viewing surface.

## Why This Matters

Mature log viewers reduce friction around file access. The core workflow is not "browse menus"; it is "get me into the right log now" and "help me return to it later".

## Primary User Story

As an engineer investigating a running system, I want to open a log file from a recent list, a favorites list, or a direct path entry so I can begin reading without losing time in file-navigation UI.

## Acceptance Criteria

- The app supports opening a log file by direct path entry.
- The app supports selecting from recent files.
- The app supports selecting from favorite files.
- The file-open workflow lets the user favorite or unfavorite a candidate without first opening it.
- A file can be marked or unmarked as a favorite from the file-open workflow.
- Follow mode can be enabled as part of opening the file or toggled immediately after opening.
- The default viewing surface stays focused on log content rather than persistent file-management chrome.
- The app stores enough metadata to show a human-friendly label for favorite or recent files.

## Notes for Implementation

- Keep file access in a lightweight overlay, palette, or transient drawer instead of a permanent sidebar.
- Favor keyboard-first access with optional mouse support.
- Recent and favorite entries should be stable even when the viewer is reopened.
