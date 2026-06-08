export const LOG_LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
export type VisibleLevel = LogLevel | "RAW";

export interface LogEntry {
  id: number;
  raw: string;
  message: string;
  timestampMs: number | null;
  timestampText: string;
  level: LogLevel | null;
  visibleLevel: VisibleLevel;
  category: string | null;
  isParsed: boolean;
  searchText: string;
}

export interface CurrentFile {
  label: string;
  source: "file" | "sample";
  size: number;
  lastModified: number;
}
