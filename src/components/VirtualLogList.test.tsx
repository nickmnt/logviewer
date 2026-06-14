import { fireEvent, render, screen } from "@testing-library/react";
import { MutableRefObject } from "react";
import { describe, expect, it, vi } from "vitest";

import { LogEntry } from "../types";
import { LOG_ROW_HEIGHT, VirtualLogList } from "./VirtualLogList";

function buildEntry(message: string, id = 0): LogEntry {
  return {
    id,
    raw: `2026-06-03 09:00:00.0000|INFO|Catalog.Api.ProductController|${message}`,
    message,
    timestampMs: Date.UTC(2026, 5, 3, 9),
    timestampText: "2026-06-03 09:00:00.0000",
    level: "INFO",
    visibleLevel: "INFO",
    category: "Catalog.Api.ProductController",
    isParsed: true,
  };
}

function buildEntries(count: number): LogEntry[] {
  return Array.from({ length: count }, (_, index) => buildEntry(`message ${index + 1}`, index));
}

describe("VirtualLogList", () => {
  it("sizes the message column from long loaded messages for horizontal exploration", () => {
    const longMessage = "x".repeat(700);
    const viewportRef: MutableRefObject<HTMLDivElement | null> = { current: null };

    render(
      <VirtualLogList
        entries={[buildEntry(longMessage)]}
        query=""
        selectedIndex={0}
        selectionId={1}
        viewportRef={viewportRef}
        onOpenDetail={vi.fn()}
        onSelectEntry={vi.fn()}
      />,
    );

    const viewport = screen.getByLabelText("Log entries");
    expect(viewport.style.getPropertyValue("--log-message-column")).toBe("704ch");
    expect(viewport.style.getPropertyValue("--log-table-width")).toBe("799ch");
  });

  it("maps Shift-wheel to horizontal log panning", () => {
    const viewportRef: MutableRefObject<HTMLDivElement | null> = { current: null };

    render(
      <VirtualLogList
        entries={[buildEntry("short message")]}
        query=""
        selectedIndex={0}
        selectionId={1}
        viewportRef={viewportRef}
        onOpenDetail={vi.fn()}
        onSelectEntry={vi.fn()}
      />,
    );

    const viewport = screen.getByLabelText("Log entries");
    viewport.scrollLeft = 0;

    fireEvent.wheel(viewport, { deltaY: 180, shiftKey: true });

    expect(viewport.scrollLeft).toBe(180);
  });

  it("updates visible rows immediately when a scroll jump outruns overscan", () => {
    const viewportRef: MutableRefObject<HTMLDivElement | null> = { current: null };
    const clientHeightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("log-viewport") ? 360 : 0;
    });
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);

    try {
      render(
        <VirtualLogList
          entries={buildEntries(500)}
          query=""
          selectedIndex={0}
          selectionId={0}
          viewportRef={viewportRef}
          onOpenDetail={vi.fn()}
          onSelectEntry={vi.fn()}
        />,
      );

      const viewport = screen.getByLabelText("Log entries");
      expect(screen.getByRole("button", { name: "Select log entry 1" })).toBeInTheDocument();

      viewport.scrollTop = LOG_ROW_HEIGHT * 80;
      fireEvent.scroll(viewport);

      expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Select log entry 63" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Select log entry 1" })).not.toBeInTheDocument();
    } finally {
      requestAnimationFrameSpy.mockRestore();
      clientHeightSpy.mockRestore();
    }
  });
});
