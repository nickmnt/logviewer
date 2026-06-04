import {
  CSSProperties,
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import sampleLogText from "../examples/nlog.log?raw";
import {
  applyFilter,
  buildPresetRange,
  buildThisHourRange,
  buildTimeContext,
  csvToList,
  cycleInList,
  EMPTY_FILTER,
  entryContainsText,
  formatDetailTime,
  formatRowTime,
  LEVEL_COLORS,
  parseLogText,
  summarizeFilters,
  topCategories,
} from "./lib/logs";
import {
  addRecent,
  getFileHandle,
  openCandidates,
  putFileHandle,
  readCatalog,
  readSavedViews,
  toggleFavorite,
  writeCatalog,
  writeSavedViews,
} from "./lib/persistence";
import {
  activateSavedView,
  applyQuickFocus,
  buildFilterPills,
  computeVisibleWindow,
  getQuickFocusMode,
  normalizeFilterSpec,
  QuickFocusMode,
  removeFilterPill,
} from "./lib/workspace";
import {
  CatalogState,
  CurrentFile,
  FileRecord,
  FilterSpec,
  LOG_LEVELS,
  LogEntry,
  LogLevel,
  OverlayName,
  SavedView,
} from "./types";

const ROW_HEIGHT = 34;
const OVERSCAN = 8;
const SAMPLE_RECORD: FileRecord = {
  id: "sample:nlog",
  label: "examples/nlog.log",
  source: "sample",
  isFavorite: false,
};

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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

async function ensureReadPermission(handle: FileSystemFileHandle, prompt: boolean): Promise<boolean> {
  const descriptor = { mode: "read" as const };
  const current = await handle.queryPermission?.(descriptor);
  if (current === "granted") {
    return true;
  }

  if (!prompt) {
    return false;
  }

  const requested = await handle.requestPermission?.(descriptor);
  return requested === "granted";
}

function StatusBadge({ token, tone = "neutral" }: { token: string; tone?: "neutral" | "accent" | "warning" }) {
  return <span className={`status-badge status-badge--${tone}`}>{token}</span>;
}

function FilterPillButton({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button className="summary-chip summary-chip--interactive" aria-label={`Remove filter ${label}`} onClick={onRemove}>
      {label}
    </button>
  );
}

function Overlay({
  title,
  subtitle,
  onClose,
  width = "wide",
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  width?: "wide" | "compact";
  children: ReactNode;
}) {
  return (
    <div className="overlay-shell" role="dialog" aria-modal="true">
      <button className="overlay-scrim" aria-label="Close" onClick={onClose} />
      <div className={`overlay-card overlay-card--${width}`}>
        <div className="overlay-header">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [catalog, setCatalog] = useState<CatalogState>(() => readCatalog());
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => readSavedViews());
  const [currentFile, setCurrentFile] = useState<CurrentFile | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [visibleEntries, setVisibleEntries] = useState<LogEntry[]>([]);
  const [filters, setFilters] = useState<FilterSpec>(EMPTY_FILTER);
  const [filterDraft, setFilterDraft] = useState<FilterSpec>(EMPTY_FILTER);
  const [selection, setSelection] = useState(0);
  const [detailVisible, setDetailVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const [overlay, setOverlay] = useState<OverlayName>(null);
  const [findQuery, setFindQuery] = useState("");
  const [findDraft, setFindDraft] = useState("");
  const [findMatches, setFindMatches] = useState<number[]>([]);
  const [activeFindMatch, setActiveFindMatch] = useState(0);
  const [activeViewName, setActiveViewName] = useState<string | null>(null);
  const [newViewName, setNewViewName] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedViewName, setSelectedViewName] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Open a log file or the bundled sample to begin.");
  const [isPending, startTransition] = useTransition();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const deferredFindQuery = useDeferredValue(findQuery.trim());
  const candidates = openCandidates(catalog);
  const selectedEntry = visibleEntries[selection] ?? null;
  const topCategoryValues = topCategories(entries, 10);
  const timeContext = buildTimeContext(entries, selectedEntry);
  const activeView = savedViews.find((view) => view.name === activeViewName) ?? null;
  const currentFavorite = currentFile
    ? catalog.records.find((record) => record.id === currentFile.id)?.isFavorite ?? false
    : false;
  const quickFocusMode = getQuickFocusMode(filters);
  const activeFilterPills = buildFilterPills(filters);
  const hasActiveFilterState = activeFilterPills.length > 0 || Boolean(deferredFindQuery) || Boolean(activeView);
  const showDetailPanel = detailVisible && Boolean(currentFile);

  useEffect(() => {
    writeCatalog(catalog);
  }, [catalog]);

  useEffect(() => {
    writeSavedViews(savedViews);
  }, [savedViews]);

  useEffect(() => {
    if (selectedCandidateId && candidates.some((candidate) => candidate.id === selectedCandidateId)) {
      return;
    }

    setSelectedCandidateId(candidates[0]?.id ?? SAMPLE_RECORD.id);
  }, [candidates, selectedCandidateId]);

  useEffect(() => {
    if (selectedViewName && savedViews.some((view) => view.name === selectedViewName)) {
      return;
    }

    setSelectedViewName(savedViews[0]?.name ?? null);
  }, [savedViews, selectedViewName]);

  useEffect(() => {
    if (!viewportRef.current) {
      return;
    }

    const observer = new ResizeObserver((entriesList) => {
      const nextHeight = entriesList[0]?.contentRect.height;
      if (nextHeight) {
        setViewportHeight(nextHeight);
      }
    });
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      const nextEntries = applyFilter(entries, filters, timeContext.referenceDate);
      startTransition(() => {
        setVisibleEntries(nextEntries);
        setSelection((current) => {
          if (nextEntries.length === 0) {
            return 0;
          }

          return Math.min(current, nextEntries.length - 1);
        });
      });
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to apply filters.");
    }
  }, [entries, filters, timeContext.referenceDate, startTransition]);

  useEffect(() => {
    const query = deferredFindQuery.toLowerCase();
    if (!query) {
      setFindMatches([]);
      setActiveFindMatch(0);
      return;
    }

    const matches = visibleEntries
      .map((entry, index) => (entryContainsText(entry, query) ? index : -1))
      .filter((index) => index >= 0);

    setFindMatches(matches);
    if (matches.length === 0) {
      setActiveFindMatch(0);
      return;
    }

    const exactMatch = matches.indexOf(selection);
    if (exactMatch >= 0) {
      setActiveFindMatch(exactMatch + 1);
      return;
    }

    const nextMatchIndex = matches.findIndex((index) => index >= selection);
    const target = nextMatchIndex >= 0 ? nextMatchIndex : 0;
    setActiveFindMatch(target + 1);
    setSelection(matches[target]);
  }, [visibleEntries, selection, deferredFindQuery]);

  useEffect(() => {
    if (!currentFile || currentFile.source !== "handle" || paused) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const handle = await getFileHandle(currentFile.id);
        if (!handle || !(await ensureReadPermission(handle, false))) {
          return;
        }

        const file = await handle.getFile();
        if (file.size === currentFile.size && file.lastModified === currentFile.lastModified) {
          return;
        }

        const text = await file.text();
        startTransition(() => {
          setEntries(parseLogText(text));
          setCurrentFile((existing) =>
            existing
              ? {
                  ...existing,
                  size: file.size,
                  lastModified: file.lastModified,
                }
              : existing,
          );
        });
        setStatusMessage(`Following ${currentFile.label}`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to follow the current file.");
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [currentFile, paused, startTransition]);

  useEffect(() => {
    if (!viewportRef.current || visibleEntries.length === 0) {
      return;
    }

    const rowTop = selection * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const viewport = viewportRef.current;
    const currentTop = viewport.scrollTop;
    const currentBottom = currentTop + viewport.clientHeight;

    if (rowTop < currentTop) {
      viewport.scrollTop = rowTop;
    } else if (rowBottom > currentBottom) {
      viewport.scrollTop = rowBottom - viewport.clientHeight;
    }
  }, [selection, visibleEntries.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "Escape" && overlay) {
        event.preventDefault();
        setOverlay(null);
        return;
      }

      if (event.key === "o") {
        event.preventDefault();
        setOverlay("open");
        return;
      }

      if (event.key === "f") {
        event.preventDefault();
        setFilterDraft(filters);
        setOverlay("filters");
        return;
      }

      if (event.key === "v") {
        event.preventDefault();
        setOverlay("views");
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        setFindDraft(findQuery);
        setOverlay("find");
        return;
      }

      if (event.key === "r") {
        event.preventDefault();
        void reloadCurrentFile();
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        setPaused((current) => !current);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        setDetailVisible((current) => !current);
        return;
      }

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(1);
        return;
      }

      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection(-1);
        return;
      }

      if (event.key === "PageDown") {
        event.preventDefault();
        moveSelection(Math.max(1, Math.floor(viewportHeight / ROW_HEIGHT) - 1));
        return;
      }

      if (event.key === "PageUp") {
        event.preventDefault();
        moveSelection(-Math.max(1, Math.floor(viewportHeight / ROW_HEIGHT) - 1));
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        setSelection(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        setSelection(Math.max(0, visibleEntries.length - 1));
        return;
      }

      if (event.key === "e" && selectedEntry?.level) {
        event.preventDefault();
        toggleExcludedLevel(selectedEntry.level);
        return;
      }

      if (event.key === "x" && selectedEntry?.category) {
        event.preventDefault();
        toggleExcludedCategory(selectedEntry.category);
        return;
      }

      if (event.key === "n") {
        event.preventDefault();
        moveFind(1);
        return;
      }

      if (event.key === "N") {
        event.preventDefault();
        moveFind(-1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filters, findQuery, overlay, selectedEntry, viewportHeight, visibleEntries.length]);

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

        const record: FileRecord = {
          id: `handle:${crypto.randomUUID()}`,
          label: handle.name,
          source: "handle",
          isFavorite: false,
        };

        await putFileHandle(record.id, handle);
        await loadHandleRecord(record, handle, true);
        return;
      }

      fileInputRef.current?.click();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to open a log file.");
    }
  }

  async function openSample(): Promise<void> {
    const record = catalog.records.find((item) => item.id === SAMPLE_RECORD.id) ?? SAMPLE_RECORD;
    setCatalog((current) => addRecent(current, record));
    startTransition(() => {
      setCurrentFile({
        id: SAMPLE_RECORD.id,
        label: SAMPLE_RECORD.label,
        source: "sample",
        size: sampleLogText.length,
        lastModified: 0,
      });
      setEntries(parseLogText(sampleLogText));
      setSelection(0);
      setPaused(false);
    });
    setStatusMessage("Opened bundled sample log.");
    setOverlay(null);
  }

  async function loadHandleRecord(record: FileRecord, handle: FileSystemFileHandle, trackRecent: boolean): Promise<void> {
    const hasPermission = await ensureReadPermission(handle, true);
    if (!hasPermission) {
      setErrorMessage(`Read permission was not granted for ${record.label}.`);
      return;
    }

    const file = await handle.getFile();
    const text = await file.text();

    if (trackRecent) {
      setCatalog((current) => addRecent(current, record));
    }

    startTransition(() => {
      setCurrentFile({
        id: record.id,
        label: record.label,
        source: "handle",
        size: file.size,
        lastModified: file.lastModified,
      });
      setEntries(parseLogText(text));
      setSelection(0);
      setPaused(false);
    });
    setStatusMessage(`Opened ${record.label}`);
    setOverlay(null);
  }

  async function openCandidate(record: FileRecord): Promise<void> {
    try {
      if (record.source === "sample") {
        await openSample();
        return;
      }

      const handle = await getFileHandle(record.id);
      if (!handle) {
        setErrorMessage(`The saved handle for ${record.label} is no longer available. Open it again from the picker.`);
        return;
      }

      await loadHandleRecord(record, handle, true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to open the selected file.");
    }
  }

  async function reloadCurrentFile(): Promise<void> {
    if (!currentFile) {
      return;
    }

    if (currentFile.source === "sample") {
      startTransition(() => setEntries(parseLogText(sampleLogText)));
      setStatusMessage("Reloaded bundled sample log.");
      return;
    }

    const handle = await getFileHandle(currentFile.id);
    if (!handle) {
      setErrorMessage(`The saved handle for ${currentFile.label} is no longer available. Open it again from the picker.`);
      return;
    }

    await loadHandleRecord(
      {
        id: currentFile.id,
        label: currentFile.label,
        source: currentFile.source,
        isFavorite: catalog.records.find((record) => record.id === currentFile.id)?.isFavorite ?? false,
      },
      handle,
      false,
    );
    setStatusMessage(`Reloaded ${currentFile.label}`);
  }

  async function copySelectedRaw(): Promise<void> {
    if (!selectedEntry?.raw || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedEntry.raw);
      setStatusMessage("Copied selected raw log line.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to copy the selected line.");
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    file
      .text()
      .then((text) => {
        const record: FileRecord = {
          id: `fallback:${crypto.randomUUID()}`,
          label: file.name,
          source: "sample",
          isFavorite: false,
        };
        setCatalog((current) => addRecent(current, record));
        startTransition(() => {
          setCurrentFile({
            id: record.id,
            label: record.label,
            source: "sample",
            size: file.size,
            lastModified: file.lastModified,
          });
          setEntries(parseLogText(text));
          setSelection(0);
          setPaused(true);
        });
        setStatusMessage(`Opened ${file.name} from browser upload.`);
        setOverlay(null);
      })
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : "Unable to read the selected file.");
      })
      .finally(() => {
        event.target.value = "";
      });
  }

  function applyCurrentFilters(next: FilterSpec): void {
    setFilters(normalizeFilterSpec(next));
    setActiveViewName(null);
    setOverlay(null);
  }

  function setQuickFocus(mode: QuickFocusMode): void {
    setFilters((current) => applyQuickFocus(current, mode));
    setActiveViewName(null);
    setStatusMessage(
      mode === "all"
        ? "Showing all severities."
        : mode === "warnings"
          ? "Focused on warning and error activity."
          : "Focused on error and fatal activity.",
    );
  }

  function applyTimePreset(minutes: number): void {
    if (timeContext.latestTimestampMs === null) {
      return;
    }

    setFilters((current) => buildPresetRange(current, timeContext.latestTimestampMs!, minutes));
    setActiveViewName(null);
    setStatusMessage(`Focused on the last ${minutes} minutes.`);
  }

  function applyThisHourPreset(): void {
    if (timeContext.latestTimestampMs === null) {
      return;
    }

    setFilters((current) => buildThisHourRange(current, timeContext.latestTimestampMs!));
    setActiveViewName(null);
    setStatusMessage("Focused on the current hour.");
  }

  function cycleDraftLevel(level: LogLevel): void {
    setFilterDraft((current) => {
      if (current.includeLevels.includes(level)) {
        return {
          ...current,
          includeLevels: current.includeLevels.filter((item) => item !== level),
          excludeLevels: cycleInList(current.excludeLevels, level),
        };
      }

      if (current.excludeLevels.includes(level)) {
        return {
          ...current,
          excludeLevels: current.excludeLevels.filter((item) => item !== level),
        };
      }

      return {
        ...current,
        includeLevels: cycleInList(current.includeLevels, level),
      };
    });
  }

  function toggleDraftExcludedCategory(category: string): void {
    setFilterDraft((current) => ({
      ...current,
      excludeCategories: cycleInList(current.excludeCategories, category),
    }));
  }

  function toggleExcludedLevel(level: LogLevel): void {
    setFilters((current) => normalizeFilterSpec({ ...current, excludeLevels: cycleInList(current.excludeLevels, level) }));
    setActiveViewName(null);
  }

  function toggleExcludedCategory(category: string): void {
    setFilters((current) =>
      normalizeFilterSpec({
        ...current,
        excludeCategories: cycleInList(current.excludeCategories, category),
      }),
    );
    setActiveViewName(null);
  }

  function clearActiveFilter(label: string): void {
    const pill = activeFilterPills.find((item) => item.label === label);
    if (!pill) {
      return;
    }

    setFilters((current) => removeFilterPill(current, pill));
    setActiveViewName(null);
  }

  function saveView(): void {
    const name = newViewName.trim();
    if (!name) {
      return;
    }

    const nextView: SavedView = {
      name,
      enabled: true,
      filterSpec: normalizeFilterSpec(filters),
    };

    setSavedViews((current) =>
      [...current.filter((view) => view.name !== name), nextView].sort((left, right) => left.name.localeCompare(right.name)),
    );
    setSelectedViewName(name);
    setActiveViewName(name);
    setStatusMessage(`Saved view ${name}`);
    setNewViewName("");
  }

  function activateView(name: string): void {
    const next = activateSavedView(savedViews, name);
    if (!next.activeViewName) {
      return;
    }

    setSavedViews(next.savedViews);
    setFilters(next.filterSpec);
    setActiveViewName(next.activeViewName);
    setOverlay(null);
    setStatusMessage(`Activated view ${name}`);
  }

  function disableView(name: string): void {
    setSavedViews((current) =>
      current.map((item) => (item.name === name ? { ...item, enabled: false } : item)),
    );
    if (activeViewName === name) {
      setActiveViewName(null);
    }
    setStatusMessage(`Disabled view ${name}`);
  }

  function moveSelection(delta: number): void {
    setSelection((current) => {
      if (visibleEntries.length === 0) {
        return 0;
      }

      return Math.max(0, Math.min(current + delta, visibleEntries.length - 1));
    });
  }

  function moveFind(step: number): void {
    if (findMatches.length === 0) {
      return;
    }

    const base = activeFindMatch <= 0 ? 0 : activeFindMatch - 1;
    const next = ((base + step) % findMatches.length + findMatches.length) % findMatches.length;
    setActiveFindMatch(next + 1);
    setSelection(findMatches[next]);
  }

  function summaryText(): string {
    const fileName = currentFile?.label ?? "No file";
    const count = `${visibleEntries.length}/${entries.length} visible`;
    const state = paused ? "paused" : currentFile?.source === "handle" ? "following" : "static";
    const tokens = summarizeFilters(filters);

    if (activeView) {
      tokens.unshift(`view:${activeView.name}`);
    }

    if (deferredFindQuery) {
      tokens.push(`find:${deferredFindQuery} ${activeFindMatch}/${findMatches.length}`);
    }

    return `${fileName}${currentFavorite ? " ★" : ""} · ${count} · ${state}${tokens.length > 0 ? ` · ${tokens.join(" · ")}` : ""}`;
  }

  const visibleWindow = computeVisibleWindow({
    itemCount: visibleEntries.length,
    rowHeight: ROW_HEIGHT,
    viewportHeight,
    scrollTop,
    overscan: OVERSCAN,
  });
  const renderedRows = visibleEntries.slice(visibleWindow.startIndex, visibleWindow.endIndex);

  return (
    <div className="app-shell">
      <input ref={fileInputRef} type="file" accept=".log,.txt" hidden onChange={handleFileInputChange} />

      <header className="topbar">
        <div className="topbar-copy">
          <p className="eyebrow">React log viewer</p>
          <h1>Logviewer</h1>
          <p className="topbar-summary">{summaryText()}</p>
        </div>
        <div className="topbar-actions">
          <button className="action-button" onClick={() => setOverlay("open")}>
            Open
          </button>
          <button
            className="action-button"
            onClick={() => {
              setFilterDraft(filters);
              setOverlay("filters");
            }}
          >
            Filters
          </button>
          <button className="action-button" onClick={() => setOverlay("views")}>
            Views
          </button>
          <button
            className="action-button"
            onClick={() => {
              setFindDraft(findQuery);
              setOverlay("find");
            }}
          >
            Find
          </button>
          <button className="action-button" onClick={() => void reloadCurrentFile()}>
            Reload
          </button>
          <button className="action-button" onClick={() => setPaused((current) => !current)}>
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      </header>

      <section className="command-deck">
        <div className="command-card">
          <span className="command-label">Focus</span>
          <div className="segmented-control" role="group" aria-label="Severity focus">
            <button
              className={`segment-button${quickFocusMode === "all" ? " segment-button--active" : ""}`}
              aria-pressed={quickFocusMode === "all"}
              onClick={() => setQuickFocus("all")}
            >
              All entries
            </button>
            <button
              className={`segment-button${quickFocusMode === "warnings" ? " segment-button--active" : ""}`}
              aria-pressed={quickFocusMode === "warnings"}
              onClick={() => setQuickFocus("warnings")}
            >
              Warnings+
            </button>
            <button
              className={`segment-button${quickFocusMode === "errors" ? " segment-button--active" : ""}`}
              aria-pressed={quickFocusMode === "errors"}
              onClick={() => setQuickFocus("errors")}
            >
              Errors only
            </button>
          </div>
        </div>

        <div className="command-card">
          <span className="command-label">Time</span>
          <div className="button-row">
            <button className="ghost-button" disabled={timeContext.latestTimestampMs === null} onClick={() => applyTimePreset(5)}>
              Last 5m
            </button>
            <button className="ghost-button" disabled={timeContext.latestTimestampMs === null} onClick={() => applyTimePreset(15)}>
              Last 15m
            </button>
            <button className="ghost-button" disabled={timeContext.latestTimestampMs === null} onClick={applyThisHourPreset}>
              This hour
            </button>
          </div>
        </div>

        <div className="command-card command-card--status">
          <span className="command-label">State</span>
          <div className="status-badge-row">
            <StatusBadge token={currentFile ? currentFile.label : "no file"} tone="accent" />
            <StatusBadge token={`${visibleEntries.length}/${entries.length} lines`} />
            <StatusBadge
              token={paused ? "paused" : currentFile?.source === "handle" ? "following" : "static"}
              tone={paused ? "warning" : "neutral"}
            />
            {currentFavorite ? <StatusBadge token="favorite" /> : null}
          </div>
        </div>
      </section>

      <section className="workspace-rails">
        <section className={`saved-view-rail${savedViews.length === 0 ? " saved-view-rail--empty" : ""}`} role="region" aria-label="Saved views">
          <div className="rail-header">
            <div>
              <p className="eyebrow">Saved views</p>
              <strong>Daily contexts</strong>
            </div>
            <button className="ghost-button" onClick={() => setOverlay("views")}>
              Manage
            </button>
          </div>
          <div className="view-rail-list">
            {savedViews.length === 0 ? (
              <p className="rail-empty">Save a filter set once, then jump back to it from here.</p>
            ) : (
              savedViews.map((view) => (
                <div
                  key={view.name}
                  className={`view-pill${activeViewName === view.name ? " view-pill--active" : ""}${view.enabled ? "" : " view-pill--disabled"}`}
                >
                  <button className="view-pill-main" onClick={() => activateView(view.name)}>
                    {view.name}
                  </button>
                  <button
                    className="view-pill-toggle"
                    onClick={() => (view.enabled ? disableView(view.name) : activateView(view.name))}
                  >
                    {view.enabled ? "On" : "Off"}
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className={`active-filter-bar${hasActiveFilterState ? "" : " active-filter-bar--empty"}`} role="region" aria-label="Active filters">
          <div className="rail-header">
            <div>
              <p className="eyebrow">Active filters</p>
              <strong>Fast noise control</strong>
            </div>
            <button
              className="ghost-button"
              onClick={() => {
                setFilters(EMPTY_FILTER);
                setActiveViewName(null);
                setFindQuery("");
                setStatusMessage("Cleared active filters and find state.");
              }}
            >
              Clear all
            </button>
          </div>
          <div className="summary-chip-row">
            {activeView ? <span className="summary-chip summary-chip--static">{`view:${activeView.name}`}</span> : null}
            {activeFilterPills.map((pill) => (
              <FilterPillButton key={pill.id} label={pill.label} onRemove={() => clearActiveFilter(pill.label)} />
            ))}
            {deferredFindQuery ? (
              <FilterPillButton label={`find:${deferredFindQuery}`} onRemove={() => setFindQuery("")} />
            ) : null}
            {isPending ? <span className="summary-chip summary-chip--static">refreshing</span> : null}
            {!hasActiveFilterState ? <span className="summary-empty">No active filters.</span> : null}
          </div>
        </section>
      </section>

      <section className="workspace">
        <div className="viewer-stack">
          <section className={`noise-bar${topCategoryValues.length === 0 ? " noise-bar--empty" : ""}`}>
            <div className="rail-header">
              <div>
                <p className="eyebrow">Noise controls</p>
                <strong>Quick category mute</strong>
              </div>
              <button
                className="ghost-button"
                onClick={() => {
                  setFilterDraft(filters);
                  setOverlay("filters");
                }}
              >
                Advanced filters
              </button>
            </div>
            {topCategoryValues.length === 0 ? (
              <p className="rail-empty">Open a log to expose the most frequent noisy categories here.</p>
            ) : (
              <div className="noise-chip-row">
                {topCategoryValues.map((category) => (
                  <button
                    key={category}
                    className={`category-chip${filters.excludeCategories.includes(category) ? " category-chip--excluded" : ""}`}
                    onClick={() => toggleExcludedCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="viewer-panel">
            <div className="table-toolbar">
              <div>
                <strong>{visibleEntries.length}</strong>
                <span> visible rows</span>
              </div>
              <div className="toolbar-actions">
                {deferredFindQuery ? <span>{`find ${activeFindMatch}/${findMatches.length}`}</span> : null}
                {currentFile ? (
                  <button className="ghost-button" onClick={() => setDetailVisible((current) => !current)}>
                    {showDetailPanel ? "Hide detail" : "Show detail"}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="table-header" role="row">
              <span>Time</span>
              <span>Level</span>
              <span>Category</span>
              <span>Message</span>
            </div>
            <div
              ref={viewportRef}
              className="table-viewport"
              onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
              tabIndex={0}
              onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  moveSelection(1);
                }
              }}
            >
              {visibleEntries.length === 0 ? (
                <div className="empty-state">
                  <p>No visible log entries.</p>
                  <span>Open a file, clear filters, or load the bundled sample.</span>
                </div>
              ) : (
                <div className="table-spacer" style={{ height: visibleWindow.totalHeight }}>
                  {renderedRows.map((entry, offset) => {
                    const absoluteIndex = visibleWindow.startIndex + offset;
                    const selected = absoluteIndex === selection;
                    return (
                      <button
                        key={entry.id}
                        className={`log-row${selected ? " log-row--selected" : ""}`}
                        style={{ transform: `translateY(${absoluteIndex * ROW_HEIGHT}px)` }}
                        onClick={() => setSelection(absoluteIndex)}
                      >
                        <span>{formatRowTime(entry)}</span>
                        <span style={{ color: entry.level ? LEVEL_COLORS[entry.level] : "#9fb4c8" }}>{entry.level ?? "RAW"}</span>
                        <span>{entry.category ?? ""}</span>
                        <span>{entry.message}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {showDetailPanel ? (
          <aside className="detail-panel">
            <div className="detail-header">
              <div>
                <h2>Detail</h2>
                <p className="overlay-note">Selection follows the table without covering the rows.</p>
              </div>
              <div className="detail-actions">
                <button className="ghost-button" onClick={() => selectedEntry?.level && toggleExcludedLevel(selectedEntry.level)}>
                  Hide level
                </button>
                <button className="ghost-button" onClick={() => selectedEntry?.category && toggleExcludedCategory(selectedEntry.category)}>
                  Hide category
                </button>
                <button className="ghost-button" onClick={() => void copySelectedRaw()}>
                  Copy raw
                </button>
              </div>
            </div>
            <pre>{buildDetailText(selectedEntry, selection, visibleEntries.length)}</pre>
          </aside>
        ) : null}
      </section>

      <footer className="statusbar">
        <span>{statusMessage}</span>
        {errorMessage ? <span className="statusbar-error">{errorMessage}</span> : null}
        <span className="shortcut-hint">o open · f filters · / find · v views · enter detail · space pause · j/k move</span>
      </footer>

      {overlay === "open" ? (
        <Overlay
          title="Open log file"
          subtitle="Use the browser file picker for local logs, or jump straight into the bundled NLog sample."
          onClose={() => setOverlay(null)}
        >
          <div className="overlay-section">
            <div className="button-row">
              <button className="primary-button" onClick={() => void openFromPicker()}>
                Open local log
              </button>
              <button className="ghost-button" onClick={() => void openSample()}>
                Open bundled sample
              </button>
            </div>
            <p className="overlay-note">Favorites and recents stay close when the browser still holds file permission.</p>
          </div>

          <div className="candidate-list">
            {[SAMPLE_RECORD, ...candidates.filter((candidate) => candidate.id !== SAMPLE_RECORD.id)].map((candidate) => (
              <div
                key={candidate.id}
                className={`candidate-card${selectedCandidateId === candidate.id ? " candidate-card--selected" : ""}`}
                onClick={() => setSelectedCandidateId(candidate.id)}
              >
                <div>
                  <strong>{candidate.label}</strong>
                  <p>{candidate.source === "handle" ? "Local file handle" : "Bundled sample or browser upload"}</p>
                </div>
                <div className="candidate-actions">
                  {candidate.id !== SAMPLE_RECORD.id ? (
                    <button
                      className="ghost-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setCatalog((current) => toggleFavorite(current, candidate.id));
                      }}
                    >
                      {catalog.records.find((record) => record.id === candidate.id)?.isFavorite ? "★ Favorite" : "☆ Favorite"}
                    </button>
                  ) : null}
                  <button className="primary-button" onClick={() => void openCandidate(candidate)}>
                    Open
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Overlay>
      ) : null}

      {overlay === "filters" ? (
        <Overlay
          title="Filters"
          subtitle="Keep the main surface lean. Use this workspace when you need exact category, level, text, or time control."
          onClose={() => setOverlay(null)}
        >
          <div className="overlay-grid">
            <section className="filter-section">
              <h3>Levels</h3>
              <p>Tap a level chip to cycle include, exclude, then neutral.</p>
              <div className="chip-grid">
                {LOG_LEVELS.map((level) => {
                  const state = filterDraft.includeLevels.includes(level)
                    ? "include"
                    : filterDraft.excludeLevels.includes(level)
                      ? "exclude"
                      : "neutral";
                  return (
                    <button
                      key={level}
                      className={`level-chip level-chip--${state}`}
                      style={{ "--level-color": LEVEL_COLORS[level] } as CSSProperties}
                      onClick={() => cycleDraftLevel(level)}
                    >
                      {state === "include" ? "+ " : state === "exclude" ? "- " : ""}
                      {level}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="filter-section">
              <h3>Quick categories</h3>
              <p>Frequent categories stay one click away so you can kill noise without leaving the list.</p>
              <div className="chip-grid">
                {topCategoryValues.map((category) => (
                  <button
                    key={category}
                    className={`category-chip${filterDraft.excludeCategories.includes(category) ? " category-chip--excluded" : ""}`}
                    onClick={() => toggleDraftExcludedCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </section>

            <section className="filter-section filter-section--fields">
              <label>
                Include categories
                <input
                  value={filterDraft.includeCategories.join(", ")}
                  placeholder="Api.LoginController, Billing.Domain"
                  onChange={(event) =>
                    setFilterDraft((current) => ({ ...current, includeCategories: csvToList(event.target.value) }))
                  }
                />
              </label>
              <label>
                Exclude categories
                <input
                  value={filterDraft.excludeCategories.join(", ")}
                  placeholder="Noise.Category, Debug.Heartbeat"
                  onChange={(event) =>
                    setFilterDraft((current) => ({ ...current, excludeCategories: csvToList(event.target.value) }))
                  }
                />
              </label>
              <label>
                Search text
                <input
                  value={filterDraft.textQuery}
                  placeholder="timeout, request_id, exception"
                  onChange={(event) => setFilterDraft((current) => ({ ...current, textQuery: event.target.value }))}
                />
              </label>
              <div className="time-grid">
                <label>
                  Start time
                  <input
                    value={filterDraft.startTime}
                    placeholder="09:15 or 2026-06-03 09:15"
                    onChange={(event) => setFilterDraft((current) => ({ ...current, startTime: event.target.value }))}
                  />
                </label>
                <label>
                  End time
                  <input
                    value={filterDraft.endTime}
                    placeholder="09:30 or 2026-06-03 09:30"
                    onChange={(event) => setFilterDraft((current) => ({ ...current, endTime: event.target.value }))}
                  />
                </label>
              </div>
              <div className="button-row">
                <button
                  className="ghost-button"
                  disabled={timeContext.latestTimestampMs === null}
                  onClick={() =>
                    timeContext.latestTimestampMs !== null &&
                    setFilterDraft((current) => buildPresetRange(current, timeContext.latestTimestampMs!, 5))
                  }
                >
                  Last 5m
                </button>
                <button
                  className="ghost-button"
                  disabled={timeContext.latestTimestampMs === null}
                  onClick={() =>
                    timeContext.latestTimestampMs !== null &&
                    setFilterDraft((current) => buildPresetRange(current, timeContext.latestTimestampMs!, 15))
                  }
                >
                  Last 15m
                </button>
                <button
                  className="ghost-button"
                  disabled={timeContext.latestTimestampMs === null}
                  onClick={() =>
                    timeContext.latestTimestampMs !== null &&
                    setFilterDraft((current) => buildThisHourRange(current, timeContext.latestTimestampMs!))
                  }
                >
                  This hour
                </button>
              </div>
            </section>
          </div>

          <div className="button-row button-row--footer">
            <button className="ghost-button" onClick={() => setFilterDraft(EMPTY_FILTER)}>
              Clear
            </button>
            <button className="primary-button" onClick={() => applyCurrentFilters(filterDraft)}>
              Apply
            </button>
          </div>
        </Overlay>
      ) : null}

      {overlay === "views" ? (
        <Overlay
          title="Saved views"
          subtitle="Store named filter combinations so daily context switching stays nearly instant."
          onClose={() => setOverlay(null)}
          width="compact"
        >
          <div className="overlay-section">
            <label>
              Save current filters
              <input value={newViewName} placeholder="errors-now" onChange={(event) => setNewViewName(event.target.value)} />
            </label>
            <div className="button-row">
              <button className="primary-button" onClick={saveView}>
                Save current
              </button>
            </div>
          </div>

          <div className="view-list">
            {savedViews.length === 0 ? (
              <p className="overlay-note">No saved views yet.</p>
            ) : (
              savedViews.map((view) => (
                <div
                  key={view.name}
                  className={`view-card${selectedViewName === view.name ? " view-card--selected" : ""}`}
                  onClick={() => setSelectedViewName(view.name)}
                >
                  <div>
                    <strong>{view.enabled ? "●" : "○"} {view.name}</strong>
                    <p>{summarizeFilters(view.filterSpec).join(" | ") || "no filters"}</p>
                  </div>
                  <div className="candidate-actions">
                    <button className="ghost-button" onClick={() => disableView(view.name)}>
                      Disable
                    </button>
                    <button className="primary-button" onClick={() => activateView(view.name)}>
                      Activate
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Overlay>
      ) : null}

      {overlay === "find" ? (
        <Overlay
          title="Find"
          subtitle="Transient search stays separate from the persistent filter set. Use n and Shift+N to move between matches."
          onClose={() => setOverlay(null)}
          width="compact"
        >
          <div className="overlay-section">
            <label>
              Find text
              <input value={findDraft} placeholder="timeout" onChange={(event) => setFindDraft(event.target.value)} />
            </label>
            <div className="button-row">
              <button
                className="ghost-button"
                onClick={() => {
                  setFindDraft("");
                  setFindQuery("");
                  setOverlay(null);
                }}
              >
                Clear
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setFindQuery(findDraft.trim());
                  setOverlay(null);
                }}
              >
                Find
              </button>
            </div>
          </div>
        </Overlay>
      ) : null}
    </div>
  );
}
