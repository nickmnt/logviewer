from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def test_example_generator_produces_nlog_file_with_all_levels_and_many_categories(tmp_path) -> None:
    output_path = tmp_path / "nlog.log"
    script_path = Path(__file__).resolve().parent.parent / "examples" / "generate_nlog_example.py"

    subprocess.run(
        [sys.executable, str(script_path), "--output", str(output_path), "--lines", "120"],
        check=True,
    )

    lines = output_path.read_text().splitlines()
    assert len(lines) == 120

    levels = {line.split("|", 3)[1] for line in lines}
    categories = {line.split("|", 3)[2] for line in lines}

    assert levels == {"TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"}
    assert len(categories) >= 20
    assert all(line.count("|") >= 3 for line in lines)
