import { MutableRefObject, ReactNode, useEffect, useRef, useState } from "react";

import { LEVEL_COLORS } from "../lib/logs";
import { LogEntry } from "../types";

export const LOG_ROW_HEIGHT = 36;
const OVERSCAN = 18;

interface VirtualLogListProps {
  copiedEntryId: number | null;
  entries: LogEntry[];
  query: string;
  selectedIndex: number;
  selectionId: number | null;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
  onCopyEntry: (entry: LogEntry) => void;
  onOpenDetail: () => void;
  onSelectEntry: (entryId: number) => void;
}

function renderHighlightedText(text: string, query: string): ReactNode {
  if (!query) {
    return text;
  }

  const source = text.toLowerCase();
  const matchIndex = source.indexOf(query);
  if (matchIndex === -1) {
    return text;
  }

  const matchEnd = matchIndex + query.length;
  return [
    text.slice(0, matchIndex),
    <mark key={`${text}-${matchIndex}`}>{text.slice(matchIndex, matchEnd)}</mark>,
    text.slice(matchEnd),
  ];
}

export function VirtualLogList({
  copiedEntryId,
  entries,
  query,
  selectedIndex,
  selectionId,
  viewportRef,
  onCopyEntry,
  onOpenDetail,
  onSelectEntry,
}: VirtualLogListProps) {
  const [windowStartIndex, setWindowStartIndex] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const scrollFrameRef = useRef<number | null>(null);
  const pendingWindowStartRef = useRef(0);

  const totalHeight = entries.length * LOG_ROW_HEIGHT;
  const visibleRowCount = viewportHeight > 0 ? Math.ceil(viewportHeight / LOG_ROW_HEIGHT) + OVERSCAN * 2 : entries.length;
  const startIndex = Math.min(windowStartIndex, Math.max(0, entries.length - visibleRowCount));
  const endIndex = Math.min(entries.length, startIndex + visibleRowCount);
  const visibleEntries = entries.slice(startIndex, endIndex);
  const topSpacerHeight = startIndex * LOG_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, totalHeight - topSpacerHeight - visibleEntries.length * LOG_ROW_HEIGHT);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      setViewportHeight(0);
      return;
    }

    const updateViewportSize = (): void => {
      setViewportHeight(viewport.clientHeight);
    };

    updateViewportSize();

    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, [viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || selectedIndex === -1) {
      return;
    }

    const itemTop = selectedIndex * LOG_ROW_HEIGHT;
    const itemBottom = itemTop + LOG_ROW_HEIGHT;

    if (itemTop < viewport.scrollTop) {
      viewport.scrollTop = itemTop;
      return;
    }

    if (itemBottom > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = itemBottom - viewport.clientHeight;
    }
  }, [selectedIndex, viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const nextWindowStartIndex = Math.max(0, Math.floor(viewport.scrollTop / LOG_ROW_HEIGHT) - OVERSCAN);
    pendingWindowStartRef.current = nextWindowStartIndex;
    setWindowStartIndex(nextWindowStartIndex);
  }, [entries, viewportRef]);

  return (
    <div
      ref={(node) => {
        viewportRef.current = node;
      }}
      className="log-viewport"
      onScroll={(event) => {
        pendingWindowStartRef.current = Math.max(0, Math.floor(event.currentTarget.scrollTop / LOG_ROW_HEIGHT) - OVERSCAN);
        if (scrollFrameRef.current !== null) {
          return;
        }

        scrollFrameRef.current = window.requestAnimationFrame(() => {
          scrollFrameRef.current = null;
          setWindowStartIndex((currentWindowStartIndex) => {
            return currentWindowStartIndex === pendingWindowStartRef.current
              ? currentWindowStartIndex
              : pendingWindowStartRef.current;
          });
        });
      }}
      tabIndex={0}
      aria-label="Log entries"
    >
      <div className="log-table-head" aria-hidden="true">
        <span className="log-head__cell log-head__cell--line">Ln</span>
        <span className="log-head__cell">Time</span>
        <span className="log-head__cell">Lvl</span>
        <span className="log-head__cell log-head__cell--category">Category</span>
        <span className="log-head__cell">Message</span>
        <span className="log-head__cell log-head__cell--action">Copy</span>
      </div>
      <div style={{ height: topSpacerHeight }} aria-hidden="true" />
      {visibleEntries.map((entry, rowOffset) => {
        const absoluteIndex = startIndex + rowOffset;
        const isSelected = entry.id === selectionId;
        const rowLabel = `Select log entry ${absoluteIndex + 1}`;

        return (
          <div
            key={entry.id}
            className={`log-row log-row--${entry.visibleLevel.toLowerCase()}${absoluteIndex % 2 === 1 ? " log-row--striped" : ""}${isSelected ? " log-row--selected" : ""}`}
            style={{ height: LOG_ROW_HEIGHT }}
            role="button"
            aria-label={rowLabel}
            aria-pressed={isSelected}
            tabIndex={-1}
            onClick={() => {
              onSelectEntry(entry.id);
              viewportRef.current?.focus({ preventScroll: true });
            }}
            onDoubleClick={onOpenDetail}
          >
            <span className="log-row__line">{absoluteIndex + 1}</span>
            <span className="log-row__time">{renderHighlightedText(entry.timestampText || "Unparsed", query)}</span>
            <span
              className="log-row__level"
              style={{ color: entry.level ? LEVEL_COLORS[entry.level] : "var(--text-faint)" }}
            >
              {renderHighlightedText(entry.visibleLevel, query)}
            </span>
            <span className="log-row__category">{renderHighlightedText(entry.category ?? "Uncategorized", query)}</span>
            <span className="log-row__message" title={entry.raw}>
              {renderHighlightedText(entry.message, query)}
            </span>
            <button
              type="button"
              className={`log-row__copy${copiedEntryId === entry.id ? " log-row__copy--done" : ""}`}
              aria-label={`Copy log entry ${absoluteIndex + 1}`}
              onClick={(event) => {
                event.stopPropagation();
                onCopyEntry(entry);
              }}
            >
              {copiedEntryId === entry.id ? "Done" : "Copy"}
            </button>
          </div>
        );
      })}
      <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />
    </div>
  );
}
