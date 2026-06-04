import { FilterSpec, LOG_LEVELS, LogLevel, SavedView } from "../types";

export type QuickFocusMode = "all" | "warnings" | "errors" | "custom";

export interface FilterPill {
  id: string;
  kind:
    | "includeLevels"
    | "excludeLevels"
    | "includeCategory"
    | "excludeCategory"
    | "text"
    | "startTime"
    | "endTime";
  label: string;
  value?: LogLevel | string;
}

export interface ActivateSavedViewResult {
  activeViewName: string | null;
  filterSpec: FilterSpec;
  savedViews: SavedView[];
}

export interface VisibleWindowInput {
  itemCount: number;
  rowHeight: number;
  viewportHeight: number;
  scrollTop: number;
  overscan: number;
}

export interface VisibleWindow {
  startIndex: number;
  endIndex: number;
  totalHeight: number;
}

const WARNING_LEVELS: LogLevel[] = ["WARN", "ERROR", "FATAL"];
const ERROR_LEVELS: LogLevel[] = ["ERROR", "FATAL"];

function normalizeLevels(levels: LogLevel[]): LogLevel[] {
  const active = new Set(levels);
  return LOG_LEVELS.filter((level) => active.has(level));
}

function normalizeCategoryList(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].sort();
}

function sameLevels(left: LogLevel[], right: LogLevel[]): boolean {
  return left.length === right.length && left.every((level) => right.includes(level));
}

export function normalizeFilterSpec(filterSpec: FilterSpec): FilterSpec {
  return {
    includeLevels: normalizeLevels(filterSpec.includeLevels),
    excludeLevels: normalizeLevels(filterSpec.excludeLevels),
    includeCategories: normalizeCategoryList(filterSpec.includeCategories),
    excludeCategories: normalizeCategoryList(filterSpec.excludeCategories),
    textQuery: filterSpec.textQuery.trim(),
    startTime: filterSpec.startTime.trim(),
    endTime: filterSpec.endTime.trim(),
  };
}

export function getQuickFocusMode(filterSpec: FilterSpec): QuickFocusMode {
  if (filterSpec.excludeLevels.length > 0) {
    return "custom";
  }

  if (filterSpec.includeLevels.length === 0) {
    return "all";
  }

  if (sameLevels(filterSpec.includeLevels, WARNING_LEVELS)) {
    return "warnings";
  }

  if (sameLevels(filterSpec.includeLevels, ERROR_LEVELS)) {
    return "errors";
  }

  return "custom";
}

export function applyQuickFocus(filterSpec: FilterSpec, mode: QuickFocusMode): FilterSpec {
  if (mode === "all" || mode === "custom") {
    return normalizeFilterSpec({
      ...filterSpec,
      includeLevels: [],
      excludeLevels: [],
    });
  }

  return normalizeFilterSpec({
    ...filterSpec,
    includeLevels: mode === "warnings" ? WARNING_LEVELS : ERROR_LEVELS,
    excludeLevels: [],
  });
}

export function buildFilterPills(filterSpec: FilterSpec): FilterPill[] {
  const pills: FilterPill[] = [];

  if (filterSpec.includeLevels.length > 0) {
    pills.push({
      id: `includeLevels:${filterSpec.includeLevels.join(",")}`,
      kind: "includeLevels",
      label: `lvl:${filterSpec.includeLevels.join(",")}`,
    });
  }

  if (filterSpec.excludeLevels.length > 0) {
    pills.push({
      id: `excludeLevels:${filterSpec.excludeLevels.join(",")}`,
      kind: "excludeLevels",
      label: `lvl:-${filterSpec.excludeLevels.join(",")}`,
    });
  }

  for (const category of filterSpec.includeCategories) {
    pills.push({
      id: `includeCategory:${category}`,
      kind: "includeCategory",
      label: `cat:${category}`,
      value: category,
    });
  }

  for (const category of filterSpec.excludeCategories) {
    pills.push({
      id: `excludeCategory:${category}`,
      kind: "excludeCategory",
      label: `cat:-${category}`,
      value: category,
    });
  }

  if (filterSpec.textQuery) {
    pills.push({
      id: `text:${filterSpec.textQuery}`,
      kind: "text",
      label: `text:${filterSpec.textQuery}`,
    });
  }

  if (filterSpec.startTime) {
    pills.push({
      id: `startTime:${filterSpec.startTime}`,
      kind: "startTime",
      label: `from:${filterSpec.startTime}`,
    });
  }

  if (filterSpec.endTime) {
    pills.push({
      id: `endTime:${filterSpec.endTime}`,
      kind: "endTime",
      label: `to:${filterSpec.endTime}`,
    });
  }

  return pills;
}

export function removeFilterPill(filterSpec: FilterSpec, pill: FilterPill): FilterSpec {
  switch (pill.kind) {
    case "includeLevels":
      return normalizeFilterSpec({ ...filterSpec, includeLevels: [] });
    case "excludeLevels":
      return normalizeFilterSpec({ ...filterSpec, excludeLevels: [] });
    case "includeCategory":
      return normalizeFilterSpec({
        ...filterSpec,
        includeCategories: filterSpec.includeCategories.filter((item) => item !== pill.value),
      });
    case "excludeCategory":
      return normalizeFilterSpec({
        ...filterSpec,
        excludeCategories: filterSpec.excludeCategories.filter((item) => item !== pill.value),
      });
    case "text":
      return normalizeFilterSpec({ ...filterSpec, textQuery: "" });
    case "startTime":
      return normalizeFilterSpec({ ...filterSpec, startTime: "" });
    case "endTime":
      return normalizeFilterSpec({ ...filterSpec, endTime: "" });
  }
}

export function activateSavedView(savedViews: SavedView[], name: string): ActivateSavedViewResult {
  const view = savedViews.find((item) => item.name === name);

  if (!view) {
    return {
      activeViewName: null,
      filterSpec: normalizeFilterSpec({
        includeLevels: [],
        excludeLevels: [],
        includeCategories: [],
        excludeCategories: [],
        textQuery: "",
        startTime: "",
        endTime: "",
      }),
      savedViews,
    };
  }

  return {
    activeViewName: name,
    filterSpec: normalizeFilterSpec({
      ...view.filterSpec,
      includeLevels: [...view.filterSpec.includeLevels],
      excludeLevels: [...view.filterSpec.excludeLevels],
      includeCategories: [...view.filterSpec.includeCategories],
      excludeCategories: [...view.filterSpec.excludeCategories],
    }),
    savedViews: savedViews.map((item) => (item.name === name ? { ...item, enabled: true } : item)),
  };
}

export function computeVisibleWindow(input: VisibleWindowInput): VisibleWindow {
  const startIndex = Math.max(0, Math.floor(input.scrollTop / input.rowHeight) - input.overscan);
  const endIndex = Math.min(
    input.itemCount,
    Math.ceil((input.scrollTop + input.viewportHeight) / input.rowHeight) + input.overscan,
  );

  return {
    startIndex,
    endIndex,
    totalHeight: input.itemCount * input.rowHeight,
  };
}
