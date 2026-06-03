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

