import {
  CSSProperties,
  ChangeEvent,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import sampleLogText from "../examples/nlog.log?raw";
import { VirtualLogList } from "./components/VirtualLogList";
import { formatDetailTime, LEVEL_COLORS, parseLogText } from "./lib/logs";
import { CurrentFile, LOG_LEVELS, LogEntry, LogLevel, VisibleLevel } from "./types";

const CHROME_IDLE_MS = 1800;
const FILTER_LEVELS = [...LOG_LEVELS, "RAW"] as const;

type OverlayKind = "palette" | "search" | "filters" | null;

function buildDetailText(entry: LogEntry | null, selectedIndex: number, totalEntries: number): string {
  if (!entry) {
    return "No entry selected.";
  }

  return [
    `Selected entry ${selectedIndex + 1}/${totalEntries}`,
    `Time: ${entry.timestampMs ? formatDetailTime(entry.timestampMs) : "Unparsed"}`,
    `Level: ${entry.level ?? "RAW"}`,
    `Category: ${entry.category ?? "Uncategorized"}`,
    "",
    "Message",
    entry.message,
    "",
    "Raw",
    entry.raw,
  ].join("\n");
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isFilePickerCancellation(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }

  if (error instanceof Error) {
    return error.name === "AbortError";
  }

  return false;
}

export default function App() {
  const [currentFile, setCurrentFile] = useState<CurrentFile | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [selectionId, setSelectionId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Open a log file or the bundled sample.");
  const [query, setQuery] = useState("");
  const [commandQuery, setCommandQuery] = useState("");
  const [activeLevels, setActiveLevels] = useState<VisibleLevel[]>([...FILTER_LEVELS]);
  const [activeOverlay, setActiveOverlay] = useState<OverlayKind>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isChromeVisible, setIsChromeVisible] = useState(true);

  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const chromeTimerRef = useRef<number | null>(null);

  const activeLevelSet = useMemo(() => new Set(activeLevels), [activeLevels]);
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => activeLevelSet.has(entry.visibleLevel) && (!deferredQuery || entry.searchText.includes(deferredQuery)));
  }, [activeLevelSet, deferredQuery, entries]);

  const selectedIndexById = useMemo(() => {
    return new Map(filteredEntries.map((entry, index) => [entry.id, index]));
  }, [filteredEntries]);
  const selectedIndex = selectionId === null ? -1 : (selectedIndexById.get(selectionId) ?? -1);
  const selectedEntry = selectedIndex === -1 ? null : filteredEntries[selectedIndex] ?? null;
  const isAllLevelsActive = activeLevels.length === FILTER_LEVELS.length;
  const hasLoadedEntries = entries.length > 0;
  const resultLabel = hasLoadedEntries
    ? `${formatCount(filteredEntries.length)} of ${formatCount(entries.length)} lines`
    : "No log loaded";

  function clearChromeTimer(): void {
    if (chromeTimerRef.current !== null) {
      window.clearTimeout(chromeTimerRef.current);
      chromeTimerRef.current = null;
    }
  }

  function scheduleChromeHide(): void {
    clearChromeTimer();
    if (activeOverlay || isDetailOpen) {
      return;
    }

    chromeTimerRef.current = window.setTimeout(() => {
      setIsChromeVisible(false);
    }, CHROME_IDLE_MS);
  }

  function revealChrome(sticky = false): void {
    setIsChromeVisible(true);
    clearChromeTimer();
    if (!sticky) {
      scheduleChromeHide();
    }
  }

  function closeTransientUi(): void {
    setActiveOverlay(null);
    setIsDetailOpen(false);
  }

  function focusViewport(): void {
    scrollViewportRef.current?.focus({ preventScroll: true });
  }

  function restoreViewportFocus(): void {
    if (!hasLoadedEntries) {
      return;
    }

    window.requestAnimationFrame(() => {
      focusViewport();
    });
  }

  function resetViewState(): void {
    setQuery("");
    setCommandQuery("");
    setActiveLevels([...FILTER_LEVELS]);
    closeTransientUi();
    scrollViewportRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }

  function loadEntries(file: CurrentFile, text: string, nextStatus: string): void {
    const parsedEntries = parseLogText(text);

    startTransition(() => {
      setCurrentFile(file);
      setEntries(parsedEntries);
      setSelectionId(parsedEntries[0]?.id ?? null);
      setErrorMessage(null);
      setStatusMessage(nextStatus);
      resetViewState();
    });
  }

  async function openFromPicker(): Promise<void> {
    revealChrome(true);

    try {
      if (typeof window.showOpenFilePicker === "function") {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: "Log files",
              accept: {
                "text/plain": [".log", ".txt"],
              },
            },
          ],
        });

        if (!handle) {
          return;
        }

        const file = await handle.getFile();
        loadEntries(
          {
            label: file.name,
            source: "file",
            size: file.size,
            lastModified: file.lastModified,
          },
          await file.text(),
          `Opened ${file.name}`,
        );
        return;
      }

      fileInputRef.current?.click();
    } catch (error) {
      if (isFilePickerCancellation(error)) {
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Unable to open a log file.");
    }
  }

  function openSample(): void {
    revealChrome(true);
    loadEntries(
      {
        label: "examples/nlog.log",
        source: "sample",
        size: sampleLogText.length,
        lastModified: 0,
      },
      sampleLogText,
      "Opened bundled sample log.",
    );
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    file
      .text()
      .then((text) => {
        loadEntries(
          {
            label: file.name,
            source: "file",
            size: file.size,
            lastModified: file.lastModified,
          },
          text,
          `Opened ${file.name}`,
        );
      })
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : "Unable to read the selected file.");
      })
      .finally(() => {
        event.target.value = "";
      });
  }

  function moveSelection(step: number): void {
    if (filteredEntries.length === 0) {
      return;
    }

    if (selectedIndex === -1) {
      setSelectionId(filteredEntries[0]?.id ?? null);
      return;
    }

    const nextIndex = Math.min(filteredEntries.length - 1, Math.max(0, selectedIndex + step));
    setSelectionId(filteredEntries[nextIndex]?.id ?? null);
  }

  function toggleLevel(level: VisibleLevel): void {
    setActiveLevels((currentLevels) => {
      if (currentLevels.includes(level)) {
        if (currentLevels.length === 1) {
          return currentLevels;
        }

        return currentLevels.filter((currentLevel) => currentLevel !== level);
      }

      return [...currentLevels, level];
    });
  }

  useEffect(() => {
    if (filteredEntries.length === 0) {
      setSelectionId(null);
      return;
    }

    if (selectionId === null || selectedIndex === -1) {
      setSelectionId(filteredEntries[0]?.id ?? null);
    }
  }, [filteredEntries, selectedIndex, selectionId]);

  useEffect(() => {
    revealChrome();

    const onActivity = (): void => revealChrome();

    window.addEventListener("mousemove", onActivity);
    window.addEventListener("touchstart", onActivity);
    window.addEventListener("focusin", onActivity);

    return () => {
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("focusin", onActivity);
      clearChromeTimer();
    };
  }, [activeOverlay, isDetailOpen]);

  useEffect(() => {
    if (activeOverlay === "search") {
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    }

    if (activeOverlay === "palette") {
      window.requestAnimationFrame(() => {
        commandInputRef.current?.focus();
        commandInputRef.current?.select();
      });
    }
  }, [activeOverlay]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const targetIsTyping = isTypingTarget(event.target);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openFromPicker();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        revealChrome(true);
        setCommandQuery("");
        setActiveOverlay("palette");
        return;
      }

      if (event.key === "Escape") {
        if (activeOverlay) {
          event.preventDefault();
          setActiveOverlay(null);
          restoreViewportFocus();
          return;
        }

        if (isDetailOpen) {
          event.preventDefault();
          setIsDetailOpen(false);
          restoreViewportFocus();
          return;
        }

        if (query) {
          event.preventDefault();
          setQuery("");
          restoreViewportFocus();
        }

        return;
      }

      if (targetIsTyping) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        revealChrome(true);
        setActiveOverlay("search");
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        revealChrome(true);
        setActiveOverlay("filters");
        return;
      }

      if (event.key === "Enter" && selectedEntry) {
        event.preventDefault();
        setIsDetailOpen((current) => !current);
        return;
      }

      if (event.key === "ArrowDown" || event.key.toLowerCase() === "j") {
        event.preventDefault();
        moveSelection(1);
        return;
      }

      if (event.key === "ArrowUp" || event.key.toLowerCase() === "k") {
        event.preventDefault();
        moveSelection(-1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeOverlay, isDetailOpen, query, selectedEntry, selectedIndex, filteredEntries]);

  const paletteItems = [
    {
      id: "open-file",
      label: "Open log file",
      hint: "Ctrl/Cmd+O",
      run: () => {
        setActiveOverlay(null);
        void openFromPicker();
      },
    },
    {
      id: "open-sample",
      label: "Open bundled sample",
      hint: "",
      run: () => {
        setActiveOverlay(null);
        openSample();
      },
    },
    {
      id: "search",
      label: query ? "Edit search query" : "Search logs",
      hint: "/",
      run: () => {
        setActiveOverlay("search");
      },
    },
    {
      id: "clear-search",
      label: "Clear search",
      hint: "Esc",
      disabled: !query,
      run: () => {
        setQuery("");
        setActiveOverlay(null);
      },
    },
    {
      id: "filters",
      label: "Filter severities",
      hint: "F",
      run: () => {
        setActiveOverlay("filters");
      },
    },
    {
      id: "clear-filters",
      label: "Show every severity",
      hint: "",
      disabled: isAllLevelsActive,
      run: () => {
        setActiveLevels([...FILTER_LEVELS]);
        setActiveOverlay(null);
      },
    },
    {
      id: "detail",
      label: isDetailOpen ? "Hide entry detail" : "Show entry detail",
      hint: "Enter",
      disabled: !selectedEntry,
      run: () => {
        setIsDetailOpen((current) => !current);
        setActiveOverlay(null);
      },
    },
  ].filter((item) => item.label.toLowerCase().includes(commandQuery.trim().toLowerCase()));

  return (
    <div className="viewer-shell" onMouseMove={() => revealChrome()} onMouseLeave={() => scheduleChromeHide()}>
      <input ref={fileInputRef} type="file" accept=".log,.txt" hidden onChange={handleFileInputChange} />

      <main className="viewer-stage" aria-label="Log viewer">
        {hasLoadedEntries ? (
          <VirtualLogList
            entries={filteredEntries}
            query={deferredQuery}
            selectedIndex={selectedIndex}
            selectionId={selectionId}
            viewportRef={scrollViewportRef}
            onOpenDetail={() => setIsDetailOpen(true)}
            onSelectEntry={(entryId) => {
              setSelectionId(entryId);
              focusViewport();
            }}
          />
        ) : (
          <section className="empty-state">
            <p className="empty-state__eyebrow">Minimal log viewer</p>
            <h1>Logs stay full-screen. Controls stay out of the way.</h1>
            <p>{statusMessage}</p>
            <div className="empty-state__actions">
              <button className="glass-button glass-button--strong" onClick={() => void openFromPicker()}>
                Open log file
              </button>
              <button className="glass-button" onClick={openSample}>
                Open bundled sample
              </button>
            </div>
            <p className="empty-state__hint">Use `Ctrl/Cmd+O` to open, `/` to search, `F` to filter, `Enter` for detail.</p>
          </section>
        )}

        <div className={`chrome-layer${isChromeVisible || activeOverlay ? " chrome-layer--visible" : ""}`}>
          <div className="chrome-bar">
            <div className="glass-chip chrome-cluster chrome-cluster--file">
              <span className="chrome-label">File</span>
              <strong>{currentFile?.label ?? "No file open"}</strong>
              {currentFile ? <span>{formatFileSize(currentFile.size)}</span> : null}
            </div>

            <div className="chrome-cluster chrome-cluster--actions">
              <button className="glass-button" onClick={() => void openFromPicker()}>
                Open
              </button>
              <button className="glass-button" onClick={() => setActiveOverlay("search")}>
                Search <kbd>/</kbd>
              </button>
              <button className="glass-button" onClick={() => setActiveOverlay("filters")}>
                Filter <kbd>F</kbd>
              </button>
              <button
                className="glass-button"
                onClick={() => {
                  setCommandQuery("");
                  setActiveOverlay("palette");
                }}
              >
                Commands <kbd>Ctrl/Cmd+K</kbd>
              </button>
            </div>
          </div>
        </div>

        {errorMessage ? (
          <div className="floating-banner" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <div className="status-stack">
          <div className="glass-chip status-pill">
            <strong>{resultLabel}</strong>
            {query ? <span>search: {query}</span> : null}
            {!isAllLevelsActive ? <span>{activeLevels.join(" ")}</span> : null}
          </div>

          {selectedEntry ? (
            <button className="glass-chip status-pill status-pill--interactive" onClick={() => setIsDetailOpen((current) => !current)}>
              <strong>
                {selectedIndex + 1}/{filteredEntries.length}
              </strong>
              <span>{selectedEntry.level ?? "RAW"}</span>
              <span>{selectedEntry.category ?? "Uncategorized"}</span>
            </button>
          ) : null}
        </div>

        {activeOverlay === "search" ? (
          <div className="overlay-card overlay-card--search" role="search" onMouseEnter={() => revealChrome(true)}>
            <label className="overlay-field">
              <span className="overlay-field__prefix">/</span>
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search time, severity, category, or raw text"
                aria-label="Search logs"
              />
            </label>
            <div className="overlay-meta">
              <span>{resultLabel}</span>
              <button className="overlay-link" onClick={() => setActiveOverlay(null)}>
                Close
              </button>
            </div>
          </div>
        ) : null}

        {activeOverlay === "filters" ? (
          <div className="overlay-card overlay-card--filters" role="dialog" aria-label="Severity filters" onMouseEnter={() => revealChrome(true)}>
            <div className="overlay-heading">
              <strong>Severity filters</strong>
              <button className="overlay-link" onClick={() => setActiveOverlay(null)}>
                Close
              </button>
            </div>
            <div className="filter-grid">
              {FILTER_LEVELS.map((level) => {
                const isActive = activeLevels.includes(level);
                const swatch = level === "RAW" ? "var(--text-faint)" : LEVEL_COLORS[level as LogLevel];

                return (
                  <button
                    key={level}
                    className={`filter-chip${isActive ? " filter-chip--active" : ""}`}
                    onClick={() => toggleLevel(level)}
                    style={{ "--filter-color": swatch } as CSSProperties}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {activeOverlay === "palette" ? (
          <>
            <button className="overlay-scrim" aria-label="Close command palette" onClick={() => setActiveOverlay(null)} />
            <div className="overlay-card overlay-card--palette" role="dialog" aria-label="Command palette">
              <label className="overlay-field">
                <span className="overlay-field__prefix">⌘</span>
                <input
                  ref={commandInputRef}
                  value={commandQuery}
                  onChange={(event) => setCommandQuery(event.target.value)}
                  placeholder="Jump to a command"
                  aria-label="Command palette"
                />
              </label>
              <div className="palette-list">
                {paletteItems.map((item) => (
                  <button
                    key={item.id}
                    className="palette-item"
                    onClick={item.run}
                    disabled={item.disabled}
                  >
                    <span>{item.label}</span>
                    {item.hint ? <kbd>{item.hint}</kbd> : null}
                  </button>
                ))}
                {paletteItems.length === 0 ? <p className="palette-empty">No matching commands.</p> : null}
              </div>
            </div>
          </>
        ) : null}

        {isDetailOpen && selectedEntry ? (
          <>
            <button className="overlay-scrim overlay-scrim--soft" aria-label="Close entry detail" onClick={() => setIsDetailOpen(false)} />
            <aside className="detail-drawer" role="dialog" aria-label="Entry detail" onMouseEnter={() => revealChrome(true)}>
              <div className="detail-drawer__header">
                <div>
                  <p>Entry detail</p>
                  <strong>
                    {selectedIndex + 1} of {filteredEntries.length}
                  </strong>
                </div>
                <button className="glass-button" onClick={() => setIsDetailOpen(false)}>
                  Close
                </button>
              </div>
              <pre>{buildDetailText(selectedEntry, selectedIndex, filteredEntries.length)}</pre>
            </aside>
          </>
        ) : null}
      </main>
    </div>
  );
}
