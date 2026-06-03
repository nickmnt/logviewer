from __future__ import annotations

from .models import FilterSpec, SavedView


class SavedViewStore:
    def save(self, name: str, filter_spec: FilterSpec) -> SavedView:
        raise NotImplementedError("Implement saved views after the TDD suite is approved.")

    def enable(self, name: str) -> SavedView:
        raise NotImplementedError("Implement saved views after the TDD suite is approved.")

    def disable(self, name: str) -> SavedView:
        raise NotImplementedError("Implement saved views after the TDD suite is approved.")

    def activate(self, name: str) -> SavedView:
        raise NotImplementedError("Implement saved views after the TDD suite is approved.")

    def active_view(self) -> SavedView | None:
        raise NotImplementedError("Implement saved views after the TDD suite is approved.")
