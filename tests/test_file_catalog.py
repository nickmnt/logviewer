from logviewer.catalog import FileCatalog


def test_open_candidates_prioritize_favorites_then_recent_files_without_duplicates() -> None:
    catalog = FileCatalog()

    catalog.add_recent("/logs/service-a.log", "service-a")
    catalog.add_recent("/logs/service-b.log", "service-b")
    catalog.toggle_favorite("/logs/service-b.log", "service-b")
    catalog.toggle_favorite("/logs/service-c.log", "service-c")

    candidates = catalog.open_candidates()

    assert [candidate.path for candidate in candidates] == [
        "/logs/service-b.log",
        "/logs/service-c.log",
        "/logs/service-a.log",
    ]
    assert [candidate.is_favorite for candidate in candidates] == [True, True, False]


def test_catalog_persists_recent_and_favorite_entries(tmp_path) -> None:
    storage_path = tmp_path / "catalog.json"
    first = FileCatalog(storage_path)

    first.add_recent("/logs/service-a.log", "service-a")
    first.toggle_favorite("/logs/service-a.log", "service-a")
    first.add_recent("/logs/service-b.log", "service-b")

    second = FileCatalog(storage_path)

    assert [candidate.path for candidate in second.open_candidates()] == [
        "/logs/service-a.log",
        "/logs/service-b.log",
    ]
    assert second.open_candidates()[0].is_favorite is True


def test_catalog_ignores_malformed_storage_payload(tmp_path) -> None:
    storage_path = tmp_path / "catalog.json"
    storage_path.write_text("{not valid json")

    catalog = FileCatalog(storage_path)

    assert catalog.open_candidates() == []
