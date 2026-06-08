import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import App from "./App";

describe("App", () => {
  it("supports keyboard navigation and entry detail from the full-screen viewer", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open bundled sample" }));

    await screen.findByText("480 of 480 lines");

    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "Enter" });

    expect(await screen.findByRole("dialog", { name: "Entry detail" })).toBeInTheDocument();
    expect(screen.getByText(/Selected entry 2\/480/)).toBeInTheDocument();
  });

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
  });

  it("filters the log stream through the search overlay", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open bundled sample" }));
    await screen.findByText("480 of 480 lines");

    await user.keyboard("/");
    await user.type(screen.getByRole("textbox", { name: "Search logs" }), "Queue lag exceeded threshold");

    expect((await screen.findAllByText("22 of 480 lines")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Queue lag exceeded threshold/i).length).toBeGreaterThan(0);
  });

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
  });

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
  });

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
  });
});
