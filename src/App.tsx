import {
  CSSProperties,
  ChangeEvent,
  Fragment,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import sampleLogText from "../examples/nlog.log?raw";
import { LOG_ROW_HEIGHT, VirtualLogList } from "./components/VirtualLogList";
import { formatDetailTime, LEVEL_COLORS, parseLogText } from "./lib/logs";
import { splitMessageBlocks } from "./lib/messageDetail";
import { CurrentFile, LOG_LEVELS, LogEntry, LogLevel, VisibleLevel } from "./types";

const FILTER_LEVELS = [...LOG_LEVELS, "RAW"] as const;

type OverlayKind = "palette" | "search" | "filters" | null;

const DEFAULT_EXPLORER_WIDTH = 280;
const MIN_EXPLORER_WIDTH = 220;
const MAX_EXPLORER_WIDTH = 520;
const EXPLORER_RESIZE_STEP = 24;

function buildDetailText(entry: LogEntry | null, selectedIndex: number, totalEntries: number): string {
  if (!entry) {
    return "No entry selected.";
  }

  return [
    `Source line ${entry.id + 1}`,
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

function hasDocumentSelection(): boolean {
  return (window.getSelection()?.toString().trim().length ?? 0) > 0;
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Clipboard write failed.");
  }
}

function renderXmlBlock(xml: string): ReactNode[] {
  return xml.split("\n").map((line, lineIndex) => {
    const tokens = line.split(/(<\/|<|\/>|>)/g).filter((token) => token.length > 0);

    return (
      <Fragment key={`xml-line-${lineIndex}`}>
        {tokens.map((token, tokenIndex) => (
          <span
            key={`xml-token-${lineIndex}-${tokenIndex}`}
            className={token === "<" || token === "</" || token === ">" || token === "/>" ? "detail-xml__bracket" : undefined}
          >
            {token}
          </span>
        ))}
        {lineIndex < xml.split("\n").length - 1 ? "\n" : null}
      </Fragment>
    );
  });
}

export default function App() {
  const [currentFile, setCurrentFile] = useState<CurrentFile | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [fileText, setFileText] = useState("");
  const [selectionId, setSelectionId] = useState<number | null>(null);
  const [copiedEntryId, setCopiedEntryId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Open a log file or the bundled sample.");
  const [query, setQuery] = useState("");
  const [commandQuery, setCommandQuery] = useState("");
  const [activeLevels, setActiveLevels] = useState<VisibleLevel[]>([...FILTER_LEVELS]);
  const [activeOverlay, setActiveOverlay] = useState<OverlayKind>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailExpanded, setIsDetailExpanded] = useState(false);
  const [isExplorerOpen, setIsExplorerOpen] = useState(true);
  const [explorerWidth, setExplorerWidth] = useState(DEFAULT_EXPLORER_WIDTH);

  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const resizeSessionRef = useRef<{ didDrag: boolean; startWidth: number; startX: number } | null>(null);
  const skipDividerClickRef = useRef(false);

  const activeLevelSet = useMemo(() => new Set(activeLevels), [activeLevels]);
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => activeLevelSet.has(entry.visibleLevel) && (!deferredQuery || entry.searchText.includes(deferredQuery)));
  }, [activeLevelSet, deferredQuery, entries]);

  const selectedIndexById = useMemo(() => {
    return new Map(filteredEntries.map((entry, index) => [entry.id, index]));
  }, [filteredEntries]);
  const selectedIndex = selectionId === null ? -1 : (selectedIndexById.get(selectionId) ?? -1);
  const selectedEntry = selectedIndex === -1 ? null : filteredEntries[selectedIndex] ?? null;
  const selectedMessageBlocks = useMemo(() => {
    return selectedEntry ? splitMessageBlocks(selectedEntry.message) : [];
  }, [selectedEntry]);
  const isAllLevelsActive = activeLevels.length === FILTER_LEVELS.length;
  const hasLoadedEntries = entries.length > 0;
  const resultLabel = hasLoadedEntries
    ? `${formatCount(filteredEntries.length)} of ${formatCount(entries.length)} lines`
    : "No log loaded";
  const levelCounts = useMemo(() => {
    const counts = new Map<VisibleLevel, number>(FILTER_LEVELS.map((level) => [level, 0]));
    entries.forEach((entry) => {
      counts.set(entry.visibleLevel, (counts.get(entry.visibleLevel) ?? 0) + 1);
    });
    return counts;
  }, [entries]);
  const layoutStyle = useMemo(
    () =>
      ({
        "--explorer-width": isExplorerOpen ? `${explorerWidth}px` : "0px",
      }) as CSSProperties,
    [explorerWidth, isExplorerOpen],
  );

  function getMaxExplorerWidth(): number {
    return Math.min(MAX_EXPLORER_WIDTH, Math.max(MIN_EXPLORER_WIDTH, Math.floor(window.innerWidth * 0.45)));
  }

  function clampExplorerWidth(nextWidth: number): number {
    return Math.min(getMaxExplorerWidth(), Math.max(MIN_EXPLORER_WIDTH, nextWidth));
  }

  function clearNoticeTimer(): void {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
  }

  function announceNotice(message: string): void {
    setErrorMessage(null);
    setNoticeMessage(message);
    clearNoticeTimer();
    noticeTimerRef.current = window.setTimeout(() => {
      setNoticeMessage(null);
      setCopiedEntryId(null);
      noticeTimerRef.current = null;
    }, 2200);
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
    clearNoticeTimer();
    setQuery("");
    setCommandQuery("");
    setActiveLevels([...FILTER_LEVELS]);
    setCopiedEntryId(null);
    setNoticeMessage(null);
    closeTransientUi();
    scrollViewportRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }

  function loadEntries(file: CurrentFile, text: string, nextStatus: string): void {
    const parsedEntries = parseLogText(text);

    startTransition(() => {
      setCurrentFile(file);
      setEntries(parsedEntries);
      setFileText(text);
      setSelectionId(parsedEntries[0]?.id ?? null);
      setErrorMessage(null);
      setStatusMessage(nextStatus);
      resetViewState();
    });
  }

  async function openFromPicker(): Promise<void> {
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

  function jumpSelection(nextIndex: number): void {
    if (filteredEntries.length === 0) {
      return;
    }

    const clampedIndex = Math.min(filteredEntries.length - 1, Math.max(0, nextIndex));
    setSelectionId(filteredEntries[clampedIndex]?.id ?? null);
  }

  function getPageJump(): number {
    const viewportHeight = scrollViewportRef.current?.clientHeight ?? LOG_ROW_HEIGHT * 12;
    return Math.max(1, Math.floor(viewportHeight / LOG_ROW_HEIGHT) - 1);
  }

  async function copySelectedLine(): Promise<void> {
    if (!selectedEntry) {
      return;
    }

    await copyEntry(selectedEntry);
  }

  async function copySelectedDetail(): Promise<void> {
    if (!selectedEntry) {
      return;
    }

    await copyTextToClipboard(buildDetailText(selectedEntry, selectedIndex, filteredEntries.length));
    setCopiedEntryId(selectedEntry.id);
    announceNotice(`Copied detail for line ${selectedEntry.id + 1}.`);
  }

  async function copyFilteredRows(): Promise<void> {
    if (filteredEntries.length === 0) {
      return;
    }

    await copyTextToClipboard(filteredEntries.map((entry) => entry.raw).join("\n"));
    announceNotice(`Copied ${formatCount(filteredEntries.length)} visible lines.`);
  }

  async function copyCurrentFile(): Promise<void> {
    if (!fileText) {
      return;
    }

    await copyTextToClipboard(fileText);
    announceNotice(`Copied ${currentFile?.label ?? "current file"}.`);
  }

  async function copyEntry(entry: LogEntry): Promise<void> {
    await copyTextToClipboard(entry.raw);
    setCopiedEntryId(entry.id);
    announceNotice(`Copied line ${entry.id + 1}.`);
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

  function openExplorer(): void {
    setIsExplorerOpen(true);
    setExplorerWidth((currentWidth) => clampExplorerWidth(currentWidth));
  }

  function toggleExplorer(): void {
    if (isExplorerOpen) {
      setIsExplorerOpen(false);
      return;
    }

    openExplorer();
  }

  function resizeExplorer(nextWidth: number): void {
    setIsExplorerOpen(true);
    setExplorerWidth(clampExplorerWidth(nextWidth));
  }

  function handleExplorerResizeStart(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.button !== 0 || !isExplorerOpen) {
      return;
    }

    event.preventDefault();
    resizeSessionRef.current = {
      didDrag: false,
      startWidth: explorerWidth,
      startX: event.clientX,
    };
    document.body.classList.add("is-resizing");
  }

  function handleExplorerDividerClick(): void {
    if (skipDividerClickRef.current) {
      skipDividerClickRef.current = false;
      return;
    }

    toggleExplorer();
  }

  function handleExplorerResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleExplorer();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeExplorer((isExplorerOpen ? explorerWidth : DEFAULT_EXPLORER_WIDTH) - EXPLORER_RESIZE_STEP);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeExplorer((isExplorerOpen ? explorerWidth : DEFAULT_EXPLORER_WIDTH) + EXPLORER_RESIZE_STEP);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      resizeExplorer(MIN_EXPLORER_WIDTH);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      resizeExplorer(getMaxExplorerWidth());
    }
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
    if (!isDetailOpen) {
      setIsDetailExpanded(false);
    }
  }, [isDetailOpen]);

  useEffect(() => {
    if (!hasLoadedEntries || activeOverlay || isDetailOpen) {
      return;
    }

    restoreViewportFocus();
  }, [activeOverlay, hasLoadedEntries, isDetailOpen]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent): void => {
      const resizeSession = resizeSessionRef.current;
      if (!resizeSession) {
        return;
      }

      resizeSession.didDrag = resizeSession.didDrag || Math.abs(event.clientX - resizeSession.startX) > 3;
      resizeExplorer(resizeSession.startWidth + event.clientX - resizeSession.startX);
    };

    const onMouseUp = (): void => {
      const resizeSession = resizeSessionRef.current;
      if (!resizeSession) {
        return;
      }

      skipDividerClickRef.current = resizeSession.didDrag;
      resizeSessionRef.current = null;
      document.body.classList.remove("is-resizing");
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.classList.remove("is-resizing");
    };
  }, []);

  useEffect(() => {
    const onResize = (): void => {
      setExplorerWidth((currentWidth) => clampExplorerWidth(currentWidth));
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    return () => {
      clearNoticeTimer();
    };
  }, []);

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
        setCommandQuery("");
        setActiveOverlay("palette");
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setActiveOverlay("search");
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && !targetIsTyping && !hasDocumentSelection()) {
        event.preventDefault();
        void copySelectedLine().catch((error: unknown) => {
          setErrorMessage(error instanceof Error ? error.message : "Unable to copy the selected log line.");
        });
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
        setActiveOverlay("search");
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
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
        return;
      }

      if (event.key === "PageDown") {
        event.preventDefault();
        moveSelection(getPageJump());
        return;
      }

      if (event.key === "PageUp") {
        event.preventDefault();
        moveSelection(-getPageJump());
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        jumpSelection(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        jumpSelection(filteredEntries.length - 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeOverlay, filteredEntries.length, isDetailOpen, query, selectedEntry, selectedIndex]);

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
    {
      id: "explorer",
      label: isExplorerOpen ? "Hide explorer" : "Show explorer",
      hint: "",
      run: () => {
        toggleExplorer();
        setActiveOverlay(null);
      },
    },
    {
      id: "copy-line",
      label: "Copy selected line",
      hint: "Ctrl/Cmd+C",
      disabled: !selectedEntry,
      run: () => {
        setActiveOverlay(null);
        void copySelectedLine().catch((error: unknown) => {
          setErrorMessage(error instanceof Error ? error.message : "Unable to copy the selected log line.");
        });
      },
    },
    {
      id: "copy-detail",
      label: "Copy selected detail",
      hint: "",
      disabled: !selectedEntry,
      run: () => {
        setActiveOverlay(null);
        void copySelectedDetail().catch((error: unknown) => {
          setErrorMessage(error instanceof Error ? error.message : "Unable to copy the selected log detail.");
        });
      },
    },
    {
      id: "copy-visible",
      label: "Copy visible lines",
      hint: "",
      disabled: filteredEntries.length === 0,
      run: () => {
        setActiveOverlay(null);
        void copyFilteredRows().catch((error: unknown) => {
          setErrorMessage(error instanceof Error ? error.message : "Unable to copy the visible log lines.");
        });
      },
    },
    {
      id: "copy-file",
      label: "Copy current file",
      hint: "",
      disabled: !fileText,
      run: () => {
        setActiveOverlay(null);
        void copyCurrentFile().catch((error: unknown) => {
          setErrorMessage(error instanceof Error ? error.message : "Unable to copy the current file.");
        });
      },
    },
  ].filter((item) => item.label.toLowerCase().includes(commandQuery.trim().toLowerCase()));

  return (
    <div className="viewer-shell">
      <input ref={fileInputRef} type="file" accept=".log,.txt" hidden onChange={handleFileInputChange} />

      <main className="viewer-stage" aria-label="Log viewer">
        <div className={`workbench${isExplorerOpen ? "" : " workbench--explorer-collapsed"}`} aria-label="Log viewer layout" style={layoutStyle}>
          <nav className="activity-rail" aria-label="Primary tools">
            <button
              className={`activity-button${isExplorerOpen ? " activity-button--active" : ""}`}
              onClick={toggleExplorer}
              aria-label={isExplorerOpen ? "Hide explorer" : "Show explorer"}
              title={isExplorerOpen ? "Hide explorer" : "Show explorer"}
            >
              LOG
            </button>
            <button className="activity-button" onClick={() => setActiveOverlay("search")} aria-label="Search logs" title="Search logs">
              /
            </button>
            <button className="activity-button" onClick={() => setActiveOverlay("filters")} aria-label="Filter severities" title="Filter severities">
              F
            </button>
            <button
              className="activity-button"
              onClick={() => {
                setCommandQuery("");
                setActiveOverlay("palette");
              }}
              aria-label="Command palette"
              title="Command palette"
            >
              K
            </button>
          </nav>

          {isExplorerOpen ? (
            <aside className="explorer-pane" aria-label="Log explorer">
              <div className="explorer-section">
                <div className="explorer-heading">Explorer</div>
                <button className="file-node file-node--active" onClick={() => void openFromPicker()}>
                  <span className="file-node__name">{currentFile?.label ?? "Open log file"}</span>
                  <span>{currentFile ? formatFileSize(currentFile.size) : "Ctrl/Cmd+O"}</span>
                </button>
                <button className="file-node" onClick={openSample}>
                  <span className="file-node__name">examples/nlog.log</span>
                  <span>sample</span>
                </button>
              </div>

              <div className="explorer-section explorer-section--levels">
                <div className="explorer-heading">Severity</div>
                {FILTER_LEVELS.map((level) => {
                  const isActive = activeLevels.includes(level);
                  const swatch = level === "RAW" ? "var(--text-faint)" : LEVEL_COLORS[level as LogLevel];

                  return (
                    <button
                      key={level}
                      className={`level-node${isActive ? " level-node--active" : ""}`}
                      onClick={() => toggleLevel(level)}
                      style={{ "--filter-color": swatch } as CSSProperties}
                    >
                      <span>{level}</span>
                      <span>{formatCount(levelCounts.get(level) ?? 0)}</span>
                    </button>
                  );
                })}
              </div>
            </aside>
          ) : (
            <aside className="explorer-pane explorer-pane--collapsed" aria-hidden="true" />
          )}

          <div
            className={`explorer-divider${isExplorerOpen ? "" : " explorer-divider--collapsed"}`}
            role="separator"
            aria-label={isExplorerOpen ? "Resize or hide explorer" : "Show explorer"}
            aria-orientation="vertical"
            aria-valuemin={MIN_EXPLORER_WIDTH}
            aria-valuemax={getMaxExplorerWidth()}
            aria-valuenow={isExplorerOpen ? explorerWidth : 0}
            tabIndex={0}
            onClick={handleExplorerDividerClick}
            onMouseDown={handleExplorerResizeStart}
            onKeyDown={handleExplorerResizeKeyDown}
          >
            <span className="explorer-divider__grip" aria-hidden="true" />
          </div>

          <section className="editor-pane" aria-label="Log editor">
            <div className="chrome-layer">
              <div className="chrome-bar">
                <div className="editor-tabs">
                  <div className="editor-tab editor-tab--active">
                    <strong>{currentFile?.label ?? "Untitled log"}</strong>
                    {currentFile ? <span>{formatFileSize(currentFile.size)}</span> : null}
                  </div>
                </div>

                <div className="chrome-cluster chrome-cluster--actions">
                  <button className="glass-button" onClick={() => void openFromPicker()}>
                    Open
                  </button>
                  <button className="glass-button" onClick={toggleExplorer}>
                    {isExplorerOpen ? "Hide sidebar" : "Show sidebar"}
                  </button>
                  <button className="glass-button" onClick={() => setActiveOverlay("search")}>
                    Search <kbd>/</kbd>
                  </button>
                  <button className="glass-button" onClick={() => setActiveOverlay("filters")}>
                    Filter <kbd>F</kbd>
                  </button>
                  <button
                    className="glass-button"
                    disabled={!selectedEntry}
                    onClick={() => {
                      void copySelectedLine().catch((error: unknown) => {
                        setErrorMessage(error instanceof Error ? error.message : "Unable to copy the selected log line.");
                      });
                    }}
                  >
                    Copy line <kbd>Ctrl/Cmd+C</kbd>
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

            {hasLoadedEntries ? (
              <VirtualLogList
                copiedEntryId={copiedEntryId}
                entries={filteredEntries}
                query={deferredQuery}
                selectedIndex={selectedIndex}
                selectionId={selectionId}
                viewportRef={scrollViewportRef}
                onCopyEntry={(entry) => {
                  void copyEntry(entry)
                    .catch((error: unknown) => {
                      setErrorMessage(error instanceof Error ? error.message : "Unable to copy the selected log line.");
                    });
                }}
                onOpenDetail={() => setIsDetailOpen(true)}
                onSelectEntry={(entryId) => {
                  setSelectionId(entryId);
                  focusViewport();
                }}
              />
            ) : (
              <section className="empty-state">
                <p className="empty-state__eyebrow">Minimal log viewer</p>
                <h1>Open a log, scan like code.</h1>
                <p>{statusMessage}</p>
                <div className="empty-state__actions">
                  <button className="glass-button glass-button--strong" onClick={() => void openFromPicker()}>
                    Open log file
                  </button>
                  <button className="glass-button" onClick={openSample}>
                    Open bundled sample
                  </button>
                </div>
                <p className="empty-state__hint">Ctrl/Cmd+O open, / search, F filter, Ctrl/Cmd+C copy, PgUp/PgDn move fast.</p>
              </section>
            )}

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
                  <span>Ln {selectedEntry.id + 1}</span>
                </button>
              ) : null}
            </div>
          </section>
        </div>

        {errorMessage ? <div className="floating-banner" role="alert">{errorMessage}</div> : null}
        {!errorMessage && noticeMessage ? <div className="floating-banner floating-banner--notice" role="status">{noticeMessage}</div> : null}

        {activeOverlay === "search" ? (
          <div className="overlay-card overlay-card--search" role="search">
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
          <div className="overlay-card overlay-card--filters" role="dialog" aria-label="Severity filters">
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
            <aside
              className={`detail-drawer${isDetailExpanded ? " detail-drawer--expanded" : ""}`}
              role="dialog"
              aria-label="Entry detail"
              style={
                {
                  "--detail-accent": selectedEntry.level ? LEVEL_COLORS[selectedEntry.level] : "var(--accent)",
                } as CSSProperties
              }
            >
              <div className="detail-drawer__header">
                <div>
                  <div className="detail-drawer__eyebrow">
                    <p>Entry detail</p>
                  </div>
                  <strong className="detail-drawer__title">{selectedIndex + 1} / {filteredEntries.length}</strong>
                </div>
                <div className="detail-drawer__actions">
                  <button className="glass-button" onClick={() => setIsDetailOpen(false)}>
                    Close
                  </button>
                </div>
              </div>
              <div className="detail-drawer__content">
                <dl className="detail-list" aria-label="Entry fields">
                  <div className="detail-list__row">
                    <dt>Date</dt>
                    <dd>{selectedEntry.timestampMs ? formatDetailTime(selectedEntry.timestampMs) : "Unparsed"}</dd>
                  </div>
                  <div className="detail-list__row">
                    <dt>Level</dt>
                    <dd>
                      <span
                        className="detail-level"
                        style={{ color: selectedEntry.level ? LEVEL_COLORS[selectedEntry.level] : "var(--text-faint)" }}
                      >
                        {selectedEntry.level ?? "RAW"}
                      </span>
                    </dd>
                  </div>
                  <div className="detail-list__row">
                    <dt>Category</dt>
                    <dd>{selectedEntry.category ?? "Uncategorized"}</dd>
                  </div>
                  <div className="detail-list__row detail-list__row--message">
                    <dt className="detail-list__label">
                      <span>Message</span>
                      <button
                        type="button"
                        className={`glass-button${isDetailExpanded ? " glass-button--strong" : ""}`}
                        aria-pressed={isDetailExpanded}
                        onClick={() => setIsDetailExpanded((current) => !current)}
                      >
                        {isDetailExpanded ? "Compact view" : "Expand message"}
                      </button>
                    </dt>
                    <dd className="detail-message">
                      {selectedMessageBlocks.map((block, index) =>
                        block.kind === "xml" ? (
                          <pre className="detail-xml" key={`${block.kind}-${index}`}>{renderXmlBlock(block.content)}</pre>
                        ) : (
                          <span className="detail-message__line" key={`${block.kind}-${index}`}>{block.content}</span>
                        ),
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </aside>
          </>
        ) : null}
      </main>
    </div>
  );
}
