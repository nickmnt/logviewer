from __future__ import annotations

import sys

from .app import LogViewerApp


def main() -> None:
    initial_path = sys.argv[1] if len(sys.argv) > 1 else None
    app = LogViewerApp(initial_path=initial_path)
    app.run()


if __name__ == "__main__":
    main()
