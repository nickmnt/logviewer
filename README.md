# Logviewer

Content-first React log viewer for standard NLog-style files.

## Run

```bash
npm install
npm run dev
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173) if Vite does not open it for you.

## Opening Logs

- Use `Open` to choose a local log file with the browser file picker.
- Use `Open bundled sample` to start instantly with [examples/nlog.log](/Users/mtagh/code/logviewer/examples/nlog.log).
- Recent files, favorites, and saved views persist locally in the browser.
- Local file follow mode works when the browser keeps permission for the file handle.

## Main Shortcuts

- `o`: open file launcher
- `f`: open filters
- `/`: open transient find
- `n`: next find match
- `Shift+N`: previous find match
- `v`: open saved views
- `e`: hide or restore the selected level
- `x`: hide or restore the selected category
- `r`: reload the current file
- `Space`: pause or resume follow mode
- `Enter`: show or hide the detail inspector
- `j` / `k`: move selection

## Behavior

- Parses standard `timestamp|LEVEL|Category|Message` NLog lines
- Keeps unmatched lines visible as raw entries
- Uses a virtualized log table for smoother scrolling on larger files
- Supports include and exclude filters for levels and categories
- Supports free-text filtering and inclusive time ranges
- Accepts human-friendly time input such as `09:15` when the file context already makes the day obvious
- Supports transient find navigation without overwriting the active filter set
- Uses standard semantic colors for log levels
- Shows the selected log entry in a side inspector instead of covering table rows
- Keeps controls in transient overlays so the main reading surface stays uncluttered

## Example Generator

Generate a reproducible NLog-style sample file with:

```bash
python3 examples/generate_nlog_example.py
```

This writes [examples/nlog.log](/Users/mtagh/code/logviewer/examples/nlog.log).
