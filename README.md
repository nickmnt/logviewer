# Logviewer

Minimal React log viewer for NLog-style files.

## Run

```bash
npm install
npm test
npm run dev
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173) if Vite does not open it for you.

## Scope

- Open a local `.log` or `.txt` file
- Open the bundled sample log at [examples/nlog.log](/Users/mtagh/code/logviewer/examples/nlog.log)
- View parsed log rows and inspect the selected entry

## Format

The viewer parses standard NLog-style rows:

```text
timestamp|LEVEL|Category|Message
```

Rows that do not match that format stay visible as raw entries.

## Example Generator

Generate a reproducible NLog-style sample file with:

```bash
python3 examples/generate_nlog_example.py
```

This writes [examples/nlog.log](/Users/mtagh/code/logviewer/examples/nlog.log).
