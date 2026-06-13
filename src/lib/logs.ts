import { LOG_LEVELS, LogEntry, LogLevel } from "../types";

export const LEVEL_COLORS: Record<LogLevel, string> = {
  TRACE: "#7f8ea3",
  DEBUG: "#4ea1ff",
  INFO: "#3ccf91",
  WARN: "#f4c95d",
  ERROR: "#ff7b72",
  FATAL: "#ff4d6d",
};

export interface ParsedMessageField {
  key: string;
  value: string;
}

export interface ParsedMessageDetails {
  headline: string;
  notes: string[];
  fields: ParsedMessageField[];
}

function parseTimestamp(value: string): number | null {
  const trimmed = value.trim();
  const [base, fraction = ""] = trimmed.split(".", 2);
  if (!base) {
    return null;
  }

  if (!fraction) {
    const parsed = Date.parse(base.replace(" ", "T"));
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (!/^\d+$/.test(fraction)) {
    return null;
  }

  const padded = `${fraction}000000`.slice(0, 6);
  const iso = `${base.replace(" ", "T")}.${padded}`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseLogMessageDetails(message: string): ParsedMessageDetails {
  const segments = message
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return {
      headline: message.trim(),
      notes: [],
      fields: [],
    };
  }

  const notes: string[] = [];
  const fields: ParsedMessageField[] = [];

  segments.slice(1).forEach((segment) => {
    const tokens = segment.split(/\s+/).filter(Boolean);
    const noteTokens: string[] = [];

    tokens.forEach((token) => {
      const match = token.match(/^([A-Za-z][\w.-]*)=(.+)$/);
      if (!match) {
        noteTokens.push(token);
        return;
      }

      if (noteTokens.length > 0) {
        notes.push(noteTokens.join(" "));
        noteTokens.length = 0;
      }

      fields.push({
        key: match[1],
        value: match[2],
      });
    });

    if (noteTokens.length > 0) {
      notes.push(noteTokens.join(" "));
    }
  });

  return {
    headline: segments[0] ?? message.trim(),
    notes,
    fields,
  };
}

function parseNlogLine(line: string, id: number): LogEntry {
  const raw = line.replace(/\r$/, "");
  const parts = raw.split("|");
  if (parts.length < 4) {
    return {
      id,
      raw,
      message: raw,
      timestampMs: null,
      timestampText: "",
      level: null,
      visibleLevel: "RAW",
      category: null,
      isParsed: false,
    };
  }

  const [timestampPart, levelPart] = parts;
  const hasHiddenCode = parts.length >= 5 && /^\d{2}$/.test(parts[2]?.trim() ?? "");
  const category = hasHiddenCode ? parts[3] ?? "" : parts[2] ?? "";
  const message = parts.slice(hasHiddenCode ? 4 : 3).join("|");
  const timestampMs = parseTimestamp(timestampPart);
  const normalizedLevel = levelPart.trim().toUpperCase();
  const level = LOG_LEVELS.find((candidate) => candidate === normalizedLevel) ?? null;

  if (timestampMs === null || level === null) {
    return {
      id,
      raw,
      message: raw,
      timestampMs: null,
      timestampText: "",
      level: null,
      visibleLevel: "RAW",
      category: null,
      isParsed: false,
    };
  }

  const timestampText = timestampPart.trim();
  return {
    id,
    raw,
    message,
    timestampMs,
    timestampText,
    level,
    visibleLevel: level,
    category,
    isParsed: true,
  };
}

export function getLogEntrySearchText(entry: LogEntry): string {
  if (!entry.isParsed || !entry.level || !entry.category) {
    return entry.raw.toLowerCase();
  }

  return [entry.timestampText, entry.level, entry.category, entry.message].join(" ").toLowerCase();
}

export function parseLogText(text: string): LogEntry[] {
  return parseLogLines(splitLogLines(text), 0);
}

export function splitLogLines(text: string): string[] {
  if (!text.trim()) {
    return [];
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

export function parseLogLines(lines: string[], startIndex: number): LogEntry[] {
  return lines.map((line, index) => parseNlogLine(line, startIndex + index));
}

export function formatDetailTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");
  const milliseconds = `${date.getMilliseconds()}`.padStart(3, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}
