import { CSSProperties, MutableRefObject, ReactNode, WheelEvent as ReactWheelEvent, useEffect, useMemo, useRef, useState } from "react";

import { LEVEL_COLORS } from "../lib/logs";
import { LogEntry } from "../types";

export const LOG_ROW_HEIGHT = 36;
const OVERSCAN = 18;
const MIN_CATEGORY_COLUMN_CH = 18;
const MAX_CATEGORY_COLUMN_CH = 64;
const MIN_MESSAGE_COLUMN_CH = 86;
const FIXED_LOG_COLUMN_CH = 64;

interface VirtualLogListProps {
  entries: LogEntry[];
  query: string;
  selectedIndex: number;
  selectionId: number | null;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function VirtualLogList({
  entries,
  query,
  selectedIndex,
  selectionId,
  viewportRef,
  onOpenDetail,
  onSelectEntry,
}: VirtualLogListProps) {
  const [windowStartIndex, setWindowStartIndex] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const scrollFrameRef = useRef<number | null>(null);
  const pendingWindowStartRef = useRef(0);

  const totalHeight = entries.length * LOG_ROW_HEIGHT;
  const columnStyle = useMemo(() => {
    const metrics = entries.reduce(
      (currentMetrics, entry) => {
        return {
          category: Math.max(currentMetrics.category, (entry.category ?? "Uncategorized").length),
          message: Math.max(currentMetrics.message, entry.message.length),
        };
      },
      { category: "Category".length, message: "Message".length },
    );

    const categoryColumnCh = clamp(metrics.category + 2, MIN_CATEGORY_COLUMN_CH, MAX_CATEGORY_COLUMN_CH);
    const messageColumnCh = Math.max(metrics.message + 4, MIN_MESSAGE_COLUMN_CH);

    return {
      "--log-category-column": `${categoryColumnCh}ch`,
      "--log-message-column": `${messageColumnCh}ch`,
      "--log-table-width": `${FIXED_LOG_COLUMN_CH + categoryColumnCh + messageColumnCh}ch`,
    } as CSSProperties;
  }, [entries]);
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

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>): void {
    if (!event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }

    event.preventDefault();
    event.currentTarget.scrollLeft += event.deltaY;
  }

  return (
    <div
      ref={(node) => {
        viewportRef.current = node;
      }}
      className="log-viewport"
      style={columnStyle}
      onWheel={handleWheel}
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
      <div className="log-table">
        <div className="log-table-head" aria-hidden="true">
          <span className="log-head__cell log-head__cell--line">Ln</span>
          <span className="log-head__cell">Time</span>
          <span className="log-head__cell">Lvl</span>
          <span className="log-head__cell log-head__cell--category">Category</span>
          <span className="log-head__cell">Message</span>
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
              <span className="log-row__message">
                {renderHighlightedText(entry.message, query)}
              </span>
            </div>
          );
        })}
        <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />
      </div>
    </div>
  );
}
