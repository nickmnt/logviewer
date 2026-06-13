import { fireEvent, render, screen } from "@testing-library/react";
import { MutableRefObject } from "react";
import { describe, expect, it, vi } from "vitest";

import { LogEntry } from "../types";
import { VirtualLogList } from "./VirtualLogList";

function buildEntry(message: string): LogEntry {
  return {
    id: 1,
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
});
