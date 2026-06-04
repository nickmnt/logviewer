export const LOG_LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEntry {
  id: number;
  raw: string;
  message: string;
  timestampMs: number | null;
  timestampText: string;
  level: LogLevel | null;
  category: string | null;
  isParsed: boolean;
}

export interface FilterSpec {
  includeLevels: LogLevel[];
  excludeLevels: LogLevel[];
  includeCategories: string[];
  excludeCategories: string[];
  textQuery: string;
  startTime: string;
  endTime: string;
}

export interface SavedView {
  name: string;
  filterSpec: FilterSpec;
  enabled: boolean;
}

export interface FileRecord {
  id: string;
  label: string;
  source: "handle" | "sample";
  isFavorite: boolean;
}

export interface CatalogState {
  recents: string[];
  records: FileRecord[];
}

export interface CurrentFile {
  id: string;
  label: string;
  source: "handle" | "sample";
  size: number;
  lastModified: number;
}

export type OverlayName = "open" | "filters" | "views" | "find" | null;

export interface TimeFilterContext {
  referenceDate: Date | null;
  latestTimestampMs: number | null;
}
