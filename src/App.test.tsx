import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import sampleLogText from "../examples/nlog.log?raw";
import App from "./App";

describe("App", () => {
  it("supports keyboard navigation and entry detail from the full-screen viewer", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open bundled sample" }));

    await screen.findByText("480 of 480 lines");

    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "Enter" });

    const dialog = await screen.findByRole("dialog", { name: "Entry detail" });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("2 / 480")).toBeInTheDocument();
    expect(within(dialog).getByText("Message")).toBeInTheDocument();
  }, 10000);

  it("shows a minimal date category and message detail layout", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open bundled sample" }));
    await screen.findByText("480 of 480 lines");

    await user.click(screen.getByRole("button", { name: "Select log entry 25" }));
    fireEvent.keyDown(window, { key: "Enter" });

    const dialog = await screen.findByRole("dialog", { name: "Entry detail" });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("25 / 480")).toBeInTheDocument();
    expect(within(dialog).getByText("2026-06-03 09:00:02.124")).toBeInTheDocument();
    expect(within(dialog).getByText("ERROR")).toBeInTheDocument();
    expect(within(dialog).getByText("Infrastructure.Storage.BlobUploader")).toBeInTheDocument();
    expect(within(dialog).getByText(/Database command failed/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Copy/i })).not.toBeInTheDocument();
  }, 10000);

  it("keeps focus on the viewport after clicking a row so arrow navigation does not leave a stale row focus ring", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open bundled sample" }));
    await screen.findByText("480 of 480 lines");

    const viewport = screen.getByLabelText("Log entries");
    const secondRow = screen.getByRole("button", { name: "Select log entry 2" });

    fireEvent.click(secondRow);

    expect(viewport).toHaveFocus();
    expect(secondRow).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(window, { key: "ArrowDown" });

    expect(viewport).toHaveFocus();
    expect(screen.getByRole("button", { name: "Select log entry 3" })).toHaveAttribute("aria-pressed", "true");
  }, 10000);

  it("filters the log stream through the search overlay", async () => {
    const user = userEvent.setup();
    const matchingLineCount = sampleLogText
      .split("\n")
      .filter((line) => line.includes("Queue lag exceeded threshold")).length;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open bundled sample" }));
    await screen.findByText("480 of 480 lines");

    await user.keyboard("/");
    await user.type(screen.getByRole("textbox", { name: "Search logs" }), "Queue lag exceeded threshold");

    expect((await screen.findAllByText(`${matchingLineCount} of 480 lines`)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Queue lag exceeded threshold/i).length).toBeGreaterThan(0);
  }, 10000);

  it("can hide and restore the explorer panel", async () => {
    const user = userEvent.setup();

    render(<App />);

    const layout = screen.getByLabelText("Log viewer layout");
    const divider = screen.getByRole("separator", { name: "Resize or hide explorer" });
    expect(layout.getAttribute("style")).toContain("--explorer-width: 280px");

    await user.click(divider);

    expect(layout.getAttribute("style")).toContain("--explorer-width: 0px");
    expect(screen.getByRole("separator", { name: "Show explorer" })).toBeInTheDocument();

    await user.click(screen.getByRole("separator", { name: "Show explorer" }));

    expect(layout.getAttribute("style")).toContain("--explorer-width: 280px");
    expect(screen.getByRole("separator", { name: "Resize or hide explorer" })).toBeInTheDocument();
  }, 10000);

  it("resizes the explorer panel from the divider without collapsing it", () => {
    render(<App />);

    const layout = screen.getByLabelText("Log viewer layout");
    const divider = screen.getByRole("separator", { name: "Resize or hide explorer" });

    fireEvent.mouseDown(divider, { button: 0, clientX: 280 });
    fireEvent.mouseMove(window, { clientX: 360 });
    fireEvent.mouseUp(window);

    expect(layout.getAttribute("style")).toContain("--explorer-width: 360px");
    expect(layout.getAttribute("style")).not.toContain("--explorer-width: 0px");
  }, 10000);

  it("copies selected raw log line with Ctrl/Cmd+C when no text selection is active", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const getSelectionSpy = vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "",
    } as Selection);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    try {
      render(<App />);

      await user.click(screen.getByRole("button", { name: "Open bundled sample" }));
      await screen.findByText("480 of 480 lines");

      fireEvent.keyDown(window, { key: "ArrowDown" });
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Select log entry 2" })).toHaveAttribute("aria-pressed", "true");
      });
      fireEvent.keyDown(window, { key: "c", ctrlKey: true });

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledOnce();
      });
      expect(await screen.findByRole("status")).toHaveTextContent("Copied line 2.");
    } finally {
      getSelectionSpy.mockRestore();
    }
  }, 10000);

  it("supports page and edge navigation like an editor", async () => {
    const user = userEvent.setup();
    const clientHeightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("log-viewport") ? 360 : 0;
    });

    try {
      render(<App />);

      await user.click(screen.getByRole("button", { name: "Open bundled sample" }));
      await screen.findByText("480 of 480 lines");

      fireEvent.keyDown(window, { key: "PageDown" });
      expect(screen.getByRole("button", { name: "Select log entry 10" })).toHaveAttribute("aria-pressed", "true");

      fireEvent.keyDown(window, { key: "End" });
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /480\/480.*Ln 480/ })).toBeInTheDocument();
      });

      fireEvent.keyDown(window, { key: "Home" });
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /1\/480.*Ln 1/ })).toBeInTheDocument();
      });
    } finally {
      clientHeightSpy.mockRestore();
    }
  }, 10000);

  it("returns focus to the viewport after Escape closes the search overlay", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open bundled sample" }));
    await screen.findByText("480 of 480 lines");

    await user.keyboard("/");
    const searchInput = screen.getByRole("textbox", { name: "Search logs" });
    await user.type(searchInput, "Queue");

    expect(searchInput).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "Search logs" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Log entries")).toHaveFocus();
    });
  }, 10000);

  it("ignores file-picker cancellation instead of showing an error", async () => {
    const user = userEvent.setup();
    const showOpenFilePicker = vi.fn().mockRejectedValue(new DOMException("The user aborted a request.", "AbortError"));

    window.showOpenFilePicker = showOpenFilePicker;

    try {
      render(<App />);

      await user.click(screen.getByRole("button", { name: "Open log file" }));

      await waitFor(() => {
        expect(showOpenFilePicker).toHaveBeenCalledOnce();
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByText("Open a log file or the bundled sample.")).toBeInTheDocument();
    } finally {
      delete window.showOpenFilePicker;
    }
  }, 10000);

  it("measures the log viewport after a file is opened so virtualization fills the screen", async () => {
    const user = userEvent.setup();
    const clientHeightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("log-viewport") ? 440 : 0;
    });

    try {
      render(<App />);

      await user.click(screen.getByRole("button", { name: "Open bundled sample" }));
      await screen.findByText("480 of 480 lines");

      await waitFor(() => {
        const visibleRows = screen.getAllByRole("button", { name: /Select log entry/i });
        expect(visibleRows.length).toBeGreaterThan(28);
        expect(visibleRows.length).toBeLessThan(480);
      });
    } finally {
      clientHeightSpy.mockRestore();
    }
  }, 10000);
});
