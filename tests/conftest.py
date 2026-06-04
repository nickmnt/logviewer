import pytest


@pytest.fixture(autouse=True)
def isolate_logviewer_home(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("LOGVIEWER_HOME", str(tmp_path / ".logviewer"))
