# Logviewer

Minimal React log viewer for pipe-delimited log files.

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

The viewer parses rows in either of these shapes:

```text
timestamp|LEVEL|Category|Message
timestamp|LEVEL|NN|Category|Message
```

When the optional `NN` field is present, the app ignores it for display and search.
Rows that do not match either format stay visible as raw entries.

## Example Generator

Generate a reproducible bundled sample file with:

```bash
python3 examples/generate_nlog_example.py
```

This writes [examples/nlog.log](/Users/mtagh/code/logviewer/examples/nlog.log).
