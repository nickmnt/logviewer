import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  it("supports keyboard navigation and entry detail from the full-screen viewer", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open bundled sample" }));

    await screen.findByText("480 of 480 lines");

    await user.keyboard("{ArrowDown}{Enter}");

    expect(await screen.findByRole("dialog", { name: "Entry detail" })).toBeInTheDocument();
    expect(screen.getByText(/Selected entry 2\/480/)).toBeInTheDocument();
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
});
