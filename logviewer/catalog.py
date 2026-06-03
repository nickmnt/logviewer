from .models import FileRecord


class FileCatalog:
    def add_recent(self, path: str, label: str) -> FileRecord:
        raise NotImplementedError("Implement file catalog behavior after the TDD suite is approved.")

    def toggle_favorite(self, path: str, label: str) -> FileRecord:
        raise NotImplementedError("Implement file catalog behavior after the TDD suite is approved.")

    def open_candidates(self) -> list[FileRecord]:
        raise NotImplementedError("Implement file catalog behavior after the TDD suite is approved.")

