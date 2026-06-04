import { describe, expect, it } from "vitest";
import { EMPTY_FILTER } from "./logs";
import {
  activateSavedView,
  applyQuickFocus,
  buildFilterPills,
  computeVisibleWindow,
  normalizeFilterSpec,
  removeFilterPill,
} from "./workspace";
import { FilterSpec, SavedView } from "../types";

describe("workspace helpers", () => {
  it("normalizes category filters before persistence", () => {
    const normalized = normalizeFilterSpec({
      ...EMPTY_FILTER,
      includeCategories: [" Auth.Api.LoginController ", "Billing.Api.InvoiceController", "Auth.Api.LoginController"],
      excludeCategories: [" Noise.Category ", "Noise.Category", ""],
      textQuery: " timeout ",
      startTime: " 09:10 ",
      endTime: " 09:20 ",
    });

    expect(normalized.includeCategories).toEqual([
      "Auth.Api.LoginController",
      "Billing.Api.InvoiceController",
    ]);
    expect(normalized.excludeCategories).toEqual(["Noise.Category"]);
    expect(normalized.textQuery).toBe("timeout");
    expect(normalized.startTime).toBe("09:10");
    expect(normalized.endTime).toBe("09:20");
  });

  it("applies quick focus presets without clearing other filters", () => {
    const focused = applyQuickFocus(
      {
        ...EMPTY_FILTER,
        textQuery: "timeout",
        excludeCategories: ["Infrastructure.Caching.RedisCache"],
      },
      "errors",
    );

    expect(focused.includeLevels).toEqual(["ERROR", "FATAL"]);
    expect(focused.textQuery).toBe("timeout");
    expect(focused.excludeCategories).toEqual(["Infrastructure.Caching.RedisCache"]);
  });

  it("builds removable filter pills and removes only the selected pill", () => {
    const filterSpec: FilterSpec = {
      includeLevels: ["WARN", "ERROR", "FATAL"],
      excludeLevels: [],
      includeCategories: [],
      excludeCategories: ["Auth.Api.LoginController", "Noise.Category"],
      textQuery: "timeout",
      startTime: "09:10",
      endTime: "09:20",
    };

    const pills = buildFilterPills(filterSpec);
    expect(pills.map((pill) => pill.label)).toEqual([
      "lvl:WARN,ERROR,FATAL",
      "cat:-Auth.Api.LoginController",
      "cat:-Noise.Category",
      "text:timeout",
      "from:09:10",
      "to:09:20",
    ]);

    const next = removeFilterPill(filterSpec, pills[1]);
    expect(next.excludeCategories).toEqual(["Noise.Category"]);
    expect(next.textQuery).toBe("timeout");
    expect(next.startTime).toBe("09:10");
  });

  it("activates a saved view without mutating the stored definition", () => {
    const savedView: SavedView = {
      name: "errors-now",
      enabled: false,
      filterSpec: {
        ...EMPTY_FILTER,
        includeLevels: ["ERROR", "FATAL"],
        excludeCategories: ["Noise.Category"],
      },
    };

    const next = activateSavedView([savedView], "errors-now");
    expect(next.activeViewName).toBe("errors-now");
    expect(next.filterSpec).toEqual(savedView.filterSpec);
    expect(next.savedViews[0]).toEqual({ ...savedView, enabled: true });
    expect(savedView.enabled).toBe(false);
  });

  it("computes a stable visible window for virtual rows", () => {
    expect(
      computeVisibleWindow({
        itemCount: 480,
        rowHeight: 34,
        viewportHeight: 510,
        scrollTop: 340,
        overscan: 8,
      }),
    ).toEqual({
      startIndex: 2,
      endIndex: 33,
      totalHeight: 16320,
    });
  });
});
