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
- `/`: open transient find
- `n`: jump to the next find match
- `Shift+N`: jump to the previous find match
- `v`: save or activate named filter views
- `*`: toggle favorite for the current file
- `e`: hide or restore the selected level
- `x`: hide or restore the selected category
- `r`: reload the current file
- `Space`: pause or resume follow mode
- `Enter`: show or hide the detail inspector
- `j` / `k`: move selection
- `q`: quit

## Behavior

- Parses standard `timestamp|LEVEL|Category|Message` NLog lines
- Keeps unmatched lines visible as raw entries
- Supports include and exclude filters for levels and categories
- Supports free-text filtering and inclusive time ranges
- Accepts human-friendly time input such as `09:15` when the log date is already obvious from the file
- Supports transient find navigation without replacing the active filters
- Uses standard semantic colors for log levels
- Shows the selected log entry in a side inspector instead of covering table rows
- Persists recent files, favorites, and saved views in a local state directory
- Keeps controls in transient modals so the main view stays focused on logs
