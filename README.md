# Logviewer

Content-first terminal log viewer for standard NLog-style files.

## Run

```bash
python3 -m logviewer /path/to/app.log
```

If no path is provided, open the app and press `o`.

## Example Log File

Generate the reproducible sample NLog file with:

```bash
python3 examples/generate_nlog_example.py
```

This writes [examples/nlog.log](/Users/mtagh/code/logviewer/examples/nlog.log).

## Main Keys

- `o`: open a log file from a direct path or recent / favorite list
- `f`: edit filters
- `v`: save or activate named filter views
- `*`: toggle favorite for the current file
- `r`: reload the current file
- `Space`: pause or resume follow mode
- `Enter`: show or hide the detail pane
- `j` / `k`: move selection
- `q`: quit

## Behavior

- Parses standard `timestamp|LEVEL|Category|Message` NLog lines
- Keeps unmatched lines visible as raw entries
- Supports include and exclude filters for levels and categories
- Supports free-text filtering and inclusive time ranges
- Persists recent files, favorites, and saved views in a local state directory
- Keeps controls in transient modals so the main view stays focused on logs
