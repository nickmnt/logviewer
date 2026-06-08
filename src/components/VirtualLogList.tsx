import { MutableRefObject, ReactNode, useEffect, useRef, useState } from "react";

import { LEVEL_COLORS } from "../lib/logs";
import { LogEntry } from "../types";

const ROW_HEIGHT = 44;
const OVERSCAN = 14;

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

  const totalHeight = entries.length * ROW_HEIGHT;
  const visibleRowCount = viewportHeight > 0 ? Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2 : entries.length;
  const startIndex = Math.min(windowStartIndex, Math.max(0, entries.length - visibleRowCount));
  const endIndex = Math.min(entries.length, startIndex + visibleRowCount);
  const visibleEntries = entries.slice(startIndex, endIndex);
  const topSpacerHeight = startIndex * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, totalHeight - topSpacerHeight - visibleEntries.length * ROW_HEIGHT);

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

    const itemTop = selectedIndex * ROW_HEIGHT;
    const itemBottom = itemTop + ROW_HEIGHT;

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

    const nextWindowStartIndex = Math.max(0, Math.floor(viewport.scrollTop / ROW_HEIGHT) - OVERSCAN);
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
        pendingWindowStartRef.current = Math.max(0, Math.floor(event.currentTarget.scrollTop / ROW_HEIGHT) - OVERSCAN);
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
      <div style={{ height: topSpacerHeight }} aria-hidden="true" />
      {visibleEntries.map((entry, rowOffset) => {
        const absoluteIndex = startIndex + rowOffset;
        const isSelected = entry.id === selectionId;

        return (
          <button
            key={entry.id}
            className={`log-row log-row--${entry.visibleLevel.toLowerCase()}${absoluteIndex % 2 === 1 ? " log-row--striped" : ""}${isSelected ? " log-row--selected" : ""}`}
            style={{ height: ROW_HEIGHT }}
            aria-label={`Select log entry ${absoluteIndex + 1}`}
            aria-pressed={isSelected}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onSelectEntry(entry.id);
              viewportRef.current?.focus({ preventScroll: true });
            }}
            onDoubleClick={onOpenDetail}
          >
            <span className="log-row__time">{renderHighlightedText(entry.timestampText || "Unparsed", query)}</span>
            <span
              className="log-row__level"
              style={{ color: entry.level ? LEVEL_COLORS[entry.level] : "var(--text-faint)" }}
            >
              {renderHighlightedText(entry.visibleLevel, query)}
            </span>
            <span className="log-row__message">
              {entry.category ? <span className="log-row__category">{renderHighlightedText(entry.category, query)}</span> : null}
              <span className="log-row__body">{renderHighlightedText(entry.message, query)}</span>
            </span>
          </button>
        );
      })}
      <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />
    </div>
  );
}
