import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listVersionSnapshots,
  getVersionSnapshot,
  deleteVersionSnapshot,
  updateVersionSnapshot,
  loadDrawingFromCloud,
} from "../data/drawingStorage";
import type { VersionSnapshot } from "../data/drawingStorage";
import "./VersionHistoryPanel.scss";

type VersionHistoryPanelProps = {
  drawingId: string;
  isDark?: boolean;
  onRestore: (canvasData: object, snapshotTimestamp: string, restoredFromVersionId: string, backupName?: string) => void;
  onClose: () => void;
  onDockedChange?: (docked: boolean) => void;
};

type FilterType = "all" | "manual" | "auto" | "starred";
type ViewMode = "card" | "compact" | "list";

const LS_PIN_KEY = "vhp-pinned";
const LS_VIEW_KEY = "vhp-view-mode";
const SIDEBAR_BREAKPOINT = 960;

// ─── Auto-generated title from canvas data ──────────────────────────────────

const generateAutoTitle = (snap: VersionSnapshot): string => {
  // If customName exists, use it (it will already have the numbering from createVersionSnapshot)
  if (snap.customName) {
    return snap.customName;
  }
  
  // Fallback for older versions without customName
  if (snap.trigger === "restore") {
    return "Restored checkpoint";
  }
  let elements: any[] = [];
  try {
    const parsed = JSON.parse(snap.canvasData);
    elements = (parsed.elements || []).filter((el: any) => !el.isDeleted);
  } catch {
    // ignore
  }
  if (elements.length === 0) {
    return snap.trigger === "manual" ? "Manual save" : "Auto-save";
  }
  const textCount = elements.filter((e: any) => e.type === "text").length;
  const drawCount = elements.filter((e: any) => e.type === "freedraw").length;
  const shapeCount = elements.filter(
    (e: any) => e.type === "rectangle" || e.type === "ellipse" || e.type === "diamond",
  ).length;

  if (snap.trigger === "auto") {
    return `Auto-save (${elements.length} element${elements.length !== 1 ? "s" : ""})`;
  }
  if (textCount > 0 && drawCount === 0 && shapeCount === 0) {
    return "Text editing";
  }
  if (drawCount > 0 && textCount === 0 && shapeCount === 0) {
    return "Drawing session";
  }
  if (shapeCount > 0 && textCount === 0 && drawCount === 0) {
    return "Shape layout";
  }
  return "Drawing session";
};

// ─── Time formatting ────────────────────────────────────────────────────────

const formatPrimaryTime = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });

  if (dStart.getTime() === startOfToday.getTime()) {
    return time;
  }
  if (dStart.getTime() === startOfYesterday.getTime()) {
    return `Yesterday, ${time}`;
  }
  const diffDays = Math.floor((startOfToday.getTime() - dStart.getTime()) / 86400000);
  if (diffDays < 7) {
    return `${d.toLocaleDateString(undefined, { weekday: "long" })}, ${time}`;
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
  }
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}, ${time}`;
};

const formatRelativeTime = (iso: string): string => {
  const now = Date.now();
  const ts = new Date(iso).getTime();
  const diffMs = now - ts;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) {
    return "Just now";
  }
  if (diffMins < 60) {
    return `${diffMins} min ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 1) {
    return "Yesterday";
  }
  return "";
};

const formatDateLabel = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (dStart.getTime() === startOfToday.getTime()) {
    if (diffMins < 5) {
      return "Just now";
    }
    if (diffMins < 60) {
      return "Earlier today";
    }
    return "Today";
  }
  if (dStart.getTime() === startOfYesterday.getTime()) {
    return "Yesterday";
  }
  if (dStart >= startOfWeek) {
    return "This week";
  }
  if (dStart >= startOfLastWeek) {
    return "Last week";
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: "long" });
  }
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

const formatPreviewDate = (iso: string) => {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const groupByDate = (
  snapshots: VersionSnapshot[],
): { label: string; items: VersionSnapshot[] }[] => {
  const groups: Map<string, VersionSnapshot[]> = new Map();
  for (const s of snapshots) {
    const label = formatDateLabel(s.timestamp);
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(s);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({
    label,
    items,
  }));
};

const triggerLabel = (trigger: string) =>
  trigger === "manual"
    ? ""
    : trigger === "restore"
      ? "AUTO"
      : "AUTO";

// ─── SVG element renderer (shared by preview & thumbnail) ───────────────────

const renderSvgElements = (
  elements: any[],
  scale: number,
  offsetX: number,
  offsetY: number,
  isDark?: boolean,
) => {
  return elements
    .filter((el: any) => !el.isDeleted)
    .map((el: any, i: number) => {
      const x = el.x * scale + offsetX;
      const y = el.y * scale + offsetY;
      const w = (el.width ?? 0) * scale;
      const h = (el.height ?? 0) * scale;
      const stroke = el.strokeColor || (isDark ? "#e3e8ea" : "#1b1b1e");
      const fill = el.backgroundColor === "transparent" ? "none" : el.backgroundColor || "none";
      const sw = Math.max((el.strokeWidth ?? 1) * scale * 0.5, 0.5);
      const opacity = el.opacity != null ? el.opacity / 100 : 1;

      if (el.type === "ellipse") {
        return (
          <ellipse key={i} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2}
            stroke={stroke} fill={fill} strokeWidth={sw} opacity={opacity} />
        );
      }
      if (el.type === "diamond") {
        const pts = `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`;
        return (
          <polygon key={i} points={pts} stroke={stroke} fill={fill} strokeWidth={sw} opacity={opacity} />
        );
      }
      if (el.type === "line" || el.type === "arrow") {
        const pts = el.points || [];
        if (pts.length < 2) {
          return null;
        }
        const d = pts
          .map((p: number[], idx: number) => `${idx === 0 ? "M" : "L"}${p[0] * scale + x} ${p[1] * scale + y}`)
          .join(" ");
        return (
          <path key={i} d={d} stroke={stroke} fill="none" strokeWidth={sw} opacity={opacity}
            markerEnd={el.type === "arrow" ? "url(#arrowhead)" : undefined} />
        );
      }
      if (el.type === "freedraw") {
        const pts = el.points || [];
        if (pts.length < 2) {
          return null;
        }
        const d = pts
          .map((p: number[], idx: number) => `${idx === 0 ? "M" : "L"}${p[0] * scale + x} ${p[1] * scale + y}`)
          .join(" ");
        return (
          <path key={i} d={d} stroke={stroke} fill="none" strokeWidth={sw} opacity={opacity} />
        );
      }
      if (el.type === "text") {
        const rawFontSize = (el.fontSize ?? 16) * scale;
        const fontSize = Math.max(rawFontSize, 6);
        const lineHeight = fontSize * 1.35;
        const lines = (el.text || el.originalText || "").split("\n");
        const fontFamily =
          el.fontFamily === 1 ? "Virgil, cursive"
            : el.fontFamily === 2 ? "Helvetica, Arial, sans-serif"
              : "Cascadia, monospace";
        return (
          <text key={i} x={x} y={y + fontSize} fill={stroke} fontSize={fontSize}
            fontFamily={fontFamily} opacity={opacity} dominantBaseline="auto">
            {lines.map((line: string, li: number) => (
              <tspan key={li} x={x} dy={li === 0 ? 0 : lineHeight}>{line || "\u00A0"}</tspan>
            ))}
          </text>
        );
      }
      return (
        <rect key={i} x={x} y={y} width={w} height={h} stroke={stroke} fill={fill}
          strokeWidth={sw} rx={(el.roundness?.value ?? 0) * scale} opacity={opacity} />
      );
    });
};

// ─── Bounding box helper ────────────────────────────────────────────────────

const computeBounds = (elements: any[]) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasElements = false;
  for (const el of elements) {
    if (el.isDeleted) {
      continue;
    }
    hasElements = true;
    let elMinX = el.x ?? 0;
    let elMinY = el.y ?? 0;
    let elMaxX = elMinX + (el.width ?? 0);
    let elMaxY = elMinY + (el.height ?? 0);
    if ((el.type === "line" || el.type === "arrow" || el.type === "freedraw") && el.points) {
      for (const pt of el.points) {
        const px = (el.x ?? 0) + pt[0];
        const py = (el.y ?? 0) + pt[1];
        elMinX = Math.min(elMinX, px);
        elMinY = Math.min(elMinY, py);
        elMaxX = Math.max(elMaxX, px);
        elMaxY = Math.max(elMaxY, py);
      }
    }
    if (el.type === "text") {
      const fontSize = el.fontSize ?? 16;
      const lines = (el.text || el.originalText || "").split("\n");
      const textHeight = lines.length * fontSize * 1.35;
      elMaxY = Math.max(elMaxY, elMinY + textHeight);
    }
    minX = Math.min(minX, elMinX);
    minY = Math.min(minY, elMinY);
    maxX = Math.max(maxX, elMaxX);
    maxY = Math.max(maxY, elMaxY);
  }
  if (!hasElements) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  }
  return { minX, minY, maxX, maxY };
};

// ─── Thumbnail component ────────────────────────────────────────────────────

const THUMB_W = 320;
const THUMB_H = 180;

const VersionThumbnail = ({ canvasData, isDark }: { canvasData: string; isDark?: boolean }) => {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(canvasData);
    } catch {
      return null;
    }
  }, [canvasData]);

  if (!parsed) {
    return <div className="vhp-thumb vhp-thumb--empty" />;
  }

  const elements = (parsed.elements || []).filter((el: any) => !el.isDeleted);
  if (elements.length === 0) {
    return (
      <div className="vhp-thumb vhp-thumb--empty">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        </svg>
      </div>
    );
  }

  const bounds = computeBounds(elements);
  const pad = 20;
  const cW = bounds.maxX - bounds.minX + pad * 2;
  const cH = bounds.maxY - bounds.minY + pad * 2;
  const scale = Math.min(THUMB_W / cW, THUMB_H / cH, 2);
  const oX = (THUMB_W - cW * scale) / 2 - (bounds.minX - pad) * scale;
  const oY = (THUMB_H - cH * scale) / 2 - (bounds.minY - pad) * scale;

  const bg = parsed.appState?.viewBackgroundColor || (isDark ? "#1a1a1e" : "#ffffff");

  return (
    <div className="vhp-thumb">
      <svg width={THUMB_W} height={THUMB_H} viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
        style={{ background: bg, display: "block", width: "100%", height: "100%" }}>
        {renderSvgElements(elements, scale, oX, oY, isDark)}
        <defs>
          <marker id="thumb-arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill={isDark ? "#e3e8ea" : "#1b1b1e"} />
          </marker>
        </defs>
      </svg>
    </div>
  );
};

// ─── Mini thumbnail for restored-from source card ──────────────────────────

const MINI_THUMB_W = 200;
const MINI_THUMB_H = 112;

const MiniSourceThumbnail = ({ canvasData, isDark }: { canvasData: string; isDark?: boolean }) => {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(canvasData);
    } catch {
      return null;
    }
  }, [canvasData]);

  if (!parsed) {
    return <div className="vhp-source-thumb vhp-source-thumb--empty" />;
  }

  const elements = (parsed.elements || []).filter((el: any) => !el.isDeleted);
  if (elements.length === 0) {
    return (
      <div className="vhp-source-thumb vhp-source-thumb--empty">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        </svg>
      </div>
    );
  }

  const bounds = computeBounds(elements);
  const pad = 16;
  const cW = bounds.maxX - bounds.minX + pad * 2;
  const cH = bounds.maxY - bounds.minY + pad * 2;
  const scale = Math.min(MINI_THUMB_W / cW, MINI_THUMB_H / cH, 2);
  const oX = (MINI_THUMB_W - cW * scale) / 2 - (bounds.minX - pad) * scale;
  const oY = (MINI_THUMB_H - cH * scale) / 2 - (bounds.minY - pad) * scale;

  const bg = parsed.appState?.viewBackgroundColor || (isDark ? "#1a1a1e" : "#ffffff");

  return (
    <div className="vhp-source-thumb">
      <svg width={MINI_THUMB_W} height={MINI_THUMB_H} viewBox={`0 0 ${MINI_THUMB_W} ${MINI_THUMB_H}`}
        style={{ background: bg, display: "block", width: "100%", height: "100%" }}>
        {renderSvgElements(elements, scale, oX, oY, isDark)}
      </svg>
    </div>
  );
};

// ─── Highlight matching text ────────────────────────────────────────────────

const HighlightText = ({ text, query }: { text: string; query: string }) => {
  if (!query.trim()) {
    return <>{text}</>;
  }
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="vhp-highlight">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
};

// ─── Component ───────────────────────────────────────────────────────────────

export const VersionHistoryPanel = ({
  drawingId,
  isDark,
  onRestore,
  onClose,
  onDockedChange,
}: VersionHistoryPanelProps) => {
  const [snapshots, setSnapshots] = useState<VersionSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Pin state (persisted)
  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem(LS_PIN_KEY) === "true"; } catch { return false; }
  });

  // View mode (persisted)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem(LS_VIEW_KEY);
      return (v === "card" || v === "compact" || v === "list") ? v : "card";
    } catch { return "card"; }
  });

  // Filter & search
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Inline rename
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Modal preview state
  const [previewSnapshot, setPreviewSnapshot] = useState<VersionSnapshot | null>(null);
  const [previewData, setPreviewData] = useState<object | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Restore confirmation
  const [restoreConfirmSnap, setRestoreConfirmSnap] = useState<VersionSnapshot | null>(null);

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Focused card index for keyboard nav
  const [focusedIdx, setFocusedIdx] = useState(-1);

  // Compare mode
  const [compareData, setCompareData] = useState<object | null>(null);

  // Zoom & pan state for preview
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const singleCanvasRef = useRef<HTMLDivElement>(null);
  const compareCanvasRef = useRef<HTMLDivElement>(null);

  // Touch/pinch zoom refs
  const touchStartDistRef = useRef(0);
  const touchStartZoomRef = useRef(1);
  const touchStartPanRef = useRef({ x: 0, y: 0 });

  // Three-dot menu
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dropdown states for consolidated header
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const viewDropdownRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  // Viewport-aware pin (auto-hide when viewport is small)
  const [canFitSidebar, setCanFitSidebar] = useState(() => window.innerWidth > SIDEBAR_BREAKPOINT);

  // Restore backup name
  const [restoreBackupName, setRestoreBackupName] = useState("");

  // Current drawing data for restore preview
  const [restoreCurrentData, setRestoreCurrentData] = useState<string | null>(null);

  // Compare mode zoom/pan per pane
  const [compareZoomA, setCompareZoomA] = useState(1);
  const [comparePanAX, setComparePanAX] = useState(0);
  const [comparePanAY, setComparePanAY] = useState(0);
  const [compareZoomB, setCompareZoomB] = useState(1);
  const [comparePanBX, setComparePanBX] = useState(0);
  const [comparePanBY, setComparePanBY] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ─── Data loading ────────────────────────────────────────────────────────

  const loadSnapshots = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) {
        setLoading(true);
      }
      try {
        const list = await listVersionSnapshots(drawingId, 100);
        setSnapshots(list);
      } catch (err) {
        console.error("Failed to load version snapshots:", err);
      } finally {
        if (showSpinner) {
          setLoading(false);
        }
      }
    },
    [drawingId],
  );

  useEffect(() => {
    loadSnapshots(true);
  }, [loadSnapshots]);

  useEffect(() => {
    pollRef.current = setInterval(() => {
      loadSnapshots(false);
    }, 3000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [loadSnapshots]);

  // Close three-dot menu on outside click or scroll
  useEffect(() => {
    if (!menuOpenId) {
      return;
    }
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
        setMenuPosition(null);
      }
    };
    const scrollHandler = () => {
      setMenuOpenId(null);
      setMenuPosition(null);
    };
    document.addEventListener("mousedown", handler);
    const listEl = listRef.current;
    if (listEl) {
      listEl.addEventListener("scroll", scrollHandler);
    }
    return () => {
      document.removeEventListener("mousedown", handler);
      if (listEl) {
        listEl.removeEventListener("scroll", scrollHandler);
      }
    };
  }, [menuOpenId]);

  // Close dropdown menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterDropdownOpen && filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setFilterDropdownOpen(false);
      }
      if (viewDropdownOpen && viewDropdownRef.current && !viewDropdownRef.current.contains(e.target as Node)) {
        setViewDropdownOpen(false);
      }
      if (headerMenuOpen && headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    };
    if (filterDropdownOpen || viewDropdownOpen || headerMenuOpen) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [filterDropdownOpen, viewDropdownOpen, headerMenuOpen]);

  // Viewport resize listener for pin auto-hide
  useEffect(() => {
    const onResize = () => {
      setCanFitSidebar(window.innerWidth > SIDEBAR_BREAKPOINT);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Persist pin state
  useEffect(() => {
    try { localStorage.setItem(LS_PIN_KEY, String(pinned)); } catch { /* ignore */ }
  }, [pinned]);

  // Notify parent of docked state changes
  const isDocked = pinned && canFitSidebar;
  useEffect(() => {
    onDockedChange?.(isDocked);
    return () => {
      onDockedChange?.(false);
    };
  }, [isDocked, onDockedChange]);

  // Persist view mode
  useEffect(() => {
    try { localStorage.setItem(LS_VIEW_KEY, viewMode); } catch { /* ignore */ }
  }, [viewMode]);

  // Compare swap state
  const [compareSwapped, setCompareSwapped] = useState(false);
  const [compareSnapshotB, setCompareSnapshotB] = useState<VersionSnapshot | null>(null);

  // Bulk delete confirmation
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // Restored-from source version cache
  const [sourceVersions, setSourceVersions] = useState<Record<string, VersionSnapshot | null>>({});
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch source versions for restore snapshots
  useEffect(() => {
    const restoreSnaps = snapshots.filter(
      (s) => s.trigger === "restore" && s.restoredFromVersionId && !(s.restoredFromVersionId in sourceVersions),
    );
    if (restoreSnaps.length === 0) {
      return;
    }
    const idsToFetch = [...new Set(restoreSnaps.map((s) => s.restoredFromVersionId))];
    for (const id of idsToFetch) {
      getVersionSnapshot(id)
        .then((snap) => {
          setSourceVersions((prev) => ({ ...prev, [id]: snap }));
        })
        .catch(() => {
          setSourceVersions((prev) => ({ ...prev, [id]: null }));
        });
    }
  }, [snapshots, sourceVersions]);

  // Cleanup highlight timer on unmount
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  // ─── Filtering & searching ───────────────────────────────────────────────

  const filteredSnapshots = snapshots.filter((s) => {
    if (filter === "manual" && s.trigger !== "manual") {
      return false;
    }
    if (filter === "auto" && s.trigger !== "auto") {
      return false;
    }
    if (filter === "starred" && !s.starred) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = (s.customName || generateAutoTitle(s)).toLowerCase();
      const time = formatPrimaryTime(s.timestamp).toLowerCase();
      const trig = triggerLabel(s.trigger || "auto").toLowerCase();
      if (!name.includes(q) && !time.includes(q) && !trig.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const groups = groupByDate(filteredSnapshots);

  const countAll = snapshots.length;
  const countManual = snapshots.filter((s) => s.trigger === "manual").length;
  const countAuto = snapshots.filter((s) => s.trigger === "auto").length;
  const countStarred = snapshots.filter((s) => s.starred).length;

  // ─── Star toggle ─────────────────────────────────────────────────────────

  const handleToggleStar = useCallback(
    async (snapshotId: string, currentStarred: boolean) => {
      setSnapshots((prev) =>
        prev.map((s) => (s.$id === snapshotId ? { ...s, starred: !currentStarred } : s)),
      );
      try {
        await updateVersionSnapshot(snapshotId, { starred: !currentStarred });
      } catch (err) {
        console.error("Failed to toggle star:", err);
        setSnapshots((prev) =>
          prev.map((s) => (s.$id === snapshotId ? { ...s, starred: currentStarred } : s)),
        );
      }
    },
    [],
  );

  // ─── Inline rename ───────────────────────────────────────────────────────

  const startRename = useCallback((snap: VersionSnapshot) => {
    setEditingId(snap.$id);
    setEditingName(snap.customName || generateAutoTitle(snap));
    setMenuOpenId(null);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }, []);

  const commitRename = useCallback(async () => {
    if (!editingId) {
      return;
    }
    const trimmed = editingName.trim();
    const snap = snapshots.find((s) => s.$id === editingId);
    if (snap && trimmed !== (snap.customName || "")) {
      setSnapshots((prev) =>
        prev.map((s) => (s.$id === editingId ? { ...s, customName: trimmed } : s)),
      );
      try {
        await updateVersionSnapshot(editingId, { customName: trimmed });
      } catch (err) {
        console.error("Failed to rename version:", err);
        setSnapshots((prev) =>
          prev.map((s) =>
            s.$id === editingId ? { ...s, customName: snap.customName || "" } : s,
          ),
        );
      }
    }
    setEditingId(null);
    setEditingName("");
  }, [editingId, editingName, snapshots]);

  // ─── Preview modal ───────────────────────────────────────────────────────

  const handleSelectVersion = useCallback(
    async (snapshot: VersionSnapshot) => {
      setLoadingPreview(true);
      setPreviewSnapshot(snapshot);
      setPreviewData(null);
      setCompareData(null);
      setCompareSnapshotB(null);
      setZoom(1);
      setPanX(0);
      setPanY(0);
      try {
        const full = await getVersionSnapshot(snapshot.$id);
        if (full) {
          setPreviewData(JSON.parse(full.canvasData));
        }
      } catch (err) {
        console.error("Failed to load version:", err);
      } finally {
        setLoadingPreview(false);
      }
    },
    [],
  );

  // Scroll to source version and highlight it, or open in preview if not in filtered list
  const scrollToSourceVersion = useCallback(
    (sourceId: string) => {
      // Check if source is visible in the current filtered list
      const isInFilteredList = filteredSnapshots.some((s) => s.$id === sourceId);
      if (!isInFilteredList) {
        // Source not in current filter — open it in preview modal instead
        const sourceSnap = sourceVersions[sourceId];
        if (sourceSnap) {
          handleSelectVersion(sourceSnap);
        }
        return;
      }
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      const el = listRef.current?.querySelector(`[data-snapshot-id="${sourceId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedCardId(sourceId);
        highlightTimerRef.current = setTimeout(() => {
          setHighlightedCardId(null);
          highlightTimerRef.current = null;
        }, 2000);
      }
    },
    [filteredSnapshots, sourceVersions, handleSelectVersion],
  );

  const handleClosePreview = useCallback(() => {
    setPreviewSnapshot(null);
    setPreviewData(null);
    setCompareData(null);
    setCompareSnapshotB(null);
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const openRestoreDialog = useCallback(async (snap: VersionSnapshot) => {
    setRestoreBackupName(`Backup before restore - ${new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}`);
    setRestoreCurrentData(null);
    setRestoreConfirmSnap(snap);
    try {
      const currentData = await loadDrawingFromCloud(drawingId);
      if (currentData) {
        setRestoreCurrentData(JSON.stringify(currentData));
      }
    } catch {
      // ignore — preview will show placeholder
    }
  }, [drawingId]);

  const handleRestoreClick = useCallback(() => {
    if (!previewSnapshot) {
      return;
    }
    openRestoreDialog(previewSnapshot);
  }, [previewSnapshot, openRestoreDialog]);

  const handleCardRestore = useCallback((snap: VersionSnapshot) => {
    openRestoreDialog(snap);
  }, [openRestoreDialog]);

  const handleRestoreConfirm = useCallback(async () => {
    if (!restoreConfirmSnap || restoring) {
      return;
    }
    setRestoring(true);
    try {
      const full = await getVersionSnapshot(restoreConfirmSnap.$id);
      if (full) {
        onRestore(JSON.parse(full.canvasData), full.timestamp, restoreConfirmSnap.$id, restoreBackupName.trim() || undefined);
        setRestoreConfirmSnap(null);
        handleClosePreview();
      }
    } catch (err) {
      console.error("Failed to restore version:", err);
    } finally {
      setRestoring(false);
    }
  }, [restoreConfirmSnap, restoring, onRestore, handleClosePreview, restoreBackupName]);

  const navigatePreview = useCallback(
    async (direction: -1 | 1) => {
      if (!previewSnapshot) {
        return;
      }
      const idx = filteredSnapshots.findIndex((s) => s.$id === previewSnapshot.$id);
      if (idx < 0) {
        return;
      }
      const nextIdx = idx + direction;
      if (nextIdx >= 0 && nextIdx < filteredSnapshots.length) {
        const nextSnap = filteredSnapshots[nextIdx];
        const wasComparing = !!compareData;
        setLoadingPreview(true);
        setPreviewSnapshot(nextSnap);
        setPreviewData(null);
        setZoom(1);
        setPanX(0);
        setPanY(0);
        try {
          const full = await getVersionSnapshot(nextSnap.$id);
          if (full) {
            setPreviewData(JSON.parse(full.canvasData));
          }
          // Re-fetch current drawing data if in compare mode
          if (wasComparing && !compareSnapshotB) {
            const currentData = await loadDrawingFromCloud(drawingId);
            setCompareData(currentData);
          }
        } catch (err) {
          console.error("Failed to load version:", err);
        } finally {
          setLoadingPreview(false);
        }
      }
    },
    [previewSnapshot, filteredSnapshots, compareData, compareSnapshotB, drawingId],
  );

  // ─── Compare mode ────────────────────────────────────────────────────────

  const handleCompare = useCallback(async () => {
    try {
      const currentData = await loadDrawingFromCloud(drawingId);
      setCompareData(currentData);
    } catch (err) {
      console.error("Failed to load current data for compare:", err);
    }
  }, [drawingId]);

  // ─── Delete ──────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (snapshotId: string) => {
      setDeleting(true);
      try {
        await deleteVersionSnapshot(snapshotId);
        setSnapshots((prev) => prev.filter((s) => s.$id !== snapshotId));
        setDeleteConfirmId(null);
        if (previewSnapshot?.$id === snapshotId) {
          handleClosePreview();
        }
      } catch (err) {
        console.error("Failed to delete version:", err);
      } finally {
        setDeleting(false);
      }
    },
    [previewSnapshot, handleClosePreview],
  );

  // ─── Bulk actions ────────────────────────────────────────────────────────

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) {
      return;
    }
    setDeleting(true);
    try {
      for (const id of selectedIds) {
        await deleteVersionSnapshot(id);
      }
      setSnapshots((prev) => prev.filter((s) => !selectedIds.has(s.$id)));
      setSelectedIds(new Set());
      setSelectMode(false);
    } catch (err) {
      console.error("Failed to bulk delete:", err);
    } finally {
      setDeleting(false);
    }
  }, [selectedIds]);

  const handleBulkStar = useCallback(async () => {
    if (selectedIds.size === 0) {
      return;
    }
    setSnapshots((prev) =>
      prev.map((s) => (selectedIds.has(s.$id) ? { ...s, starred: true } : s)),
    );
    try {
      for (const id of selectedIds) {
        await updateVersionSnapshot(id, { starred: true });
      }
    } catch (err) {
      console.error("Failed to bulk star:", err);
    }
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [selectedIds]);

  const handleBulkUnstar = useCallback(async () => {
    if (selectedIds.size === 0) {
      return;
    }
    setSnapshots((prev) =>
      prev.map((s) => (selectedIds.has(s.$id) ? { ...s, starred: false } : s)),
    );
    try {
      for (const id of selectedIds) {
        await updateVersionSnapshot(id, { starred: false });
      }
    } catch (err) {
      console.error("Failed to bulk unstar:", err);
    }
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [selectedIds]);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(filteredSnapshots.map((s) => s.$id)));
  }, [filteredSnapshots]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleCompareSelected = useCallback(async () => {
    if (selectedIds.size !== 2) {
      return;
    }
    const ids = Array.from(selectedIds);
    const snapA = snapshots.find((s) => s.$id === ids[0]);
    const snapB = snapshots.find((s) => s.$id === ids[1]);
    if (!snapA || !snapB) {
      return;
    }
    setPreviewSnapshot(snapA);
    setCompareSnapshotB(snapB);
    setLoadingPreview(true);
    try {
      const fullA = await getVersionSnapshot(snapA.$id);
      const fullB = await getVersionSnapshot(snapB.$id);
      if (fullA) {
        setPreviewData(JSON.parse(fullA.canvasData));
      }
      if (fullB) {
        setCompareData(JSON.parse(fullB.canvasData));
      }
      setCompareSwapped(false);
    } catch (err) {
      console.error("Failed to compare selected:", err);
    } finally {
      setLoadingPreview(false);
    }
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [selectedIds, snapshots]);

  // ─── Zoom helpers ────────────────────────────────────────────────────────

  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 5;
  const ZOOM_STEP = 0.25;

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN));
  }, []);

  const fitToScreen = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const wasComparingRef = useRef(false);

  useEffect(() => {
    const isComparing = !!compareData;
    if (wasComparingRef.current !== isComparing) {
      fitToScreen();
      wasComparingRef.current = isComparing;
    }
  }, [compareData, fitToScreen]);

  // Attach wheel + native touch listeners with passive:false to prevent browser zoom
  useEffect(() => {
    const refs = compareData
      ? [singleCanvasRef.current, compareCanvasRef.current]
      : [singleCanvasRef.current];
    const els = refs.filter(Boolean) as HTMLDivElement[];
    if (els.length === 0) {
      return;
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        setZoom((z) => Math.min(Math.max(z + delta, ZOOM_MIN), ZOOM_MAX));
      } else {
        setPanX((px) => px - e.deltaX);
        setPanY((py) => py - e.deltaY);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        touchStartDistRef.current = getTouchDistance(
          e.touches[0] as unknown as React.Touch,
          e.touches[1] as unknown as React.Touch,
        );
        touchStartZoomRef.current = zoom;
        const center = getTouchCenter(
          e.touches[0] as unknown as React.Touch,
          e.touches[1] as unknown as React.Touch,
        );
        touchStartPanRef.current = { x: center.x - panX, y: center.y - panY };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getTouchDistance(
          e.touches[0] as unknown as React.Touch,
          e.touches[1] as unknown as React.Touch,
        );
        const scale = dist / touchStartDistRef.current;
        const newZoom = Math.min(Math.max(touchStartZoomRef.current * scale, ZOOM_MIN), ZOOM_MAX);
        setZoom(newZoom);
        const center = getTouchCenter(
          e.touches[0] as unknown as React.Touch,
          e.touches[1] as unknown as React.Touch,
        );
        setPanX(center.x - touchStartPanRef.current.x);
        setPanY(center.y - touchStartPanRef.current.y);
      }
    };

    for (const el of els) {
      el.addEventListener("wheel", onWheel, { passive: false });
      el.addEventListener("touchstart", onTouchStart, { passive: false });
      el.addEventListener("touchmove", onTouchMove, { passive: false });
    }
    return () => {
      for (const el of els) {
        el.removeEventListener("wheel", onWheel);
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
      }
    };
  }, [compareData, zoom, panX, panY]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 1 || e.button === 0) {
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [panX, panY],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanningRef.current) {
      return;
    }
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPanX(panStartRef.current.panX + dx);
    setPanY(panStartRef.current.panY + dy);
  }, []);

  const handlePointerUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const getTouchDistance = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const getTouchCenter = (t1: React.Touch, t2: React.Touch) => ({
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  });

  // Touch handlers are now attached as native listeners in the useEffect above
  // to ensure passive:false works (React synthetic events are passive by default)

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === "Escape") {
        if (restoreConfirmSnap) {
          setRestoreConfirmSnap(null);
        } else if (previewSnapshot) {
          handleClosePreview();
        } else if (deleteConfirmId) {
          setDeleteConfirmId(null);
        } else if (selectMode) {
          setSelectMode(false);
          setSelectedIds(new Set());
        } else if (!pinned) {
          onClose();
        }
        e.preventDefault();
        return;
      }

      if (previewSnapshot) {
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          navigatePreview(-1);
        }
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          navigatePreview(1);
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "=") {
          e.preventDefault();
          zoomIn();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "-") {
          e.preventDefault();
          zoomOut();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "0") {
          e.preventDefault();
          fitToScreen();
        }
        return;
      }

      // Card-level keyboard navigation
      if (filteredSnapshots.length > 0) {
        if (e.key === "ArrowDown" || e.key === "j") {
          e.preventDefault();
          setFocusedIdx((prev) => Math.min(prev + 1, filteredSnapshots.length - 1));
        }
        if (e.key === "ArrowUp" || e.key === "k") {
          e.preventDefault();
          setFocusedIdx((prev) => Math.max(prev - 1, 0));
        }
        if (e.key === "Enter" && focusedIdx >= 0) {
          e.preventDefault();
          handleSelectVersion(filteredSnapshots[focusedIdx]);
        }
        if ((e.key === "s" || e.key === "S") && focusedIdx >= 0 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          const snap = filteredSnapshots[focusedIdx];
          handleToggleStar(snap.$id, !!snap.starred);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    previewSnapshot, deleteConfirmId, restoreConfirmSnap, selectMode, pinned,
    focusedIdx, filteredSnapshots, onClose, handleClosePreview,
    navigatePreview, handleSelectVersion, handleToggleStar,
    zoomIn, zoomOut, fitToScreen,
  ]);

  // ─── Preview canvas renderer ─────────────────────────────────────────────

  const renderPreviewCanvas = (data: object | null, canvasW = 900, canvasH = 560, canvasRef?: React.RefObject<HTMLDivElement | null>) => {
    if (!data) {
      return null;
    }
    const scene = data as any;
    const elements = scene.elements || [];
    if (elements.length === 0) {
      return <div className="vhp-modal__empty">No elements in this version</div>;
    }

    const bounds = computeBounds(elements);
    const padding = 60;
    const contentW = bounds.maxX - bounds.minX + padding * 2;
    const contentH = bounds.maxY - bounds.minY + padding * 2;
    const baseScale = Math.min(canvasW / contentW, canvasH / contentH, 1.5);
    const oX = (canvasW - contentW * baseScale) / 2 - (bounds.minX - padding) * baseScale;
    const oY = (canvasH - contentH * baseScale) / 2 - (bounds.minY - padding) * baseScale;

    const bgColor = scene.appState?.viewBackgroundColor || (isDark ? "#1a1a1e" : "#ffffff");

    return (
      <div
        ref={canvasRef || canvasContainerRef}
        className="vhp-modal__canvas-wrap"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="vhp-modal__canvas"
          style={{
            background: bgColor,
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
        >
          <svg width={canvasW} height={canvasH} viewBox={`0 0 ${canvasW} ${canvasH}`}
            style={{ display: "block" }}>
            {renderSvgElements(elements, baseScale, oX, oY, isDark)}
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={isDark ? "#e3e8ea" : "#1b1b1e"} />
              </marker>
            </defs>
          </svg>
        </div>
      </div>
    );
  };

  // ─── Compute prev/next availability ──────────────────────────────────────

  const previewIdx = previewSnapshot
    ? filteredSnapshots.findIndex((s) => s.$id === previewSnapshot.$id)
    : -1;
  const hasPrev = previewIdx > 0;
  const hasNext = previewIdx >= 0 && previewIdx < filteredSnapshots.length - 1;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={`version-history-panel${isDark ? " version-history-panel--dark" : ""}${isDocked ? " version-history-panel--docked" : ""}`}>
      {/* Header — clean: icon + title + count | pin + close */}
      <div className="vhp-header">
        <div className="vhp-header__title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Version history
          {!loading && snapshots.length > 0 && (
            <span className="vhp-header__count">{snapshots.length}</span>
          )}
        </div>
        <div className="vhp-header__actions">
          {/* Header 3-dot menu (select multiple, etc.) - HIDDEN */}
          {/* {!loading && snapshots.length > 1 && (
            <div className="vhp-header__menu-wrap" ref={headerMenuRef}>
              <button
                className={`vhp-header__menu-btn${headerMenuOpen ? " vhp-header__menu-btn--active" : ""}`}
                title="More options"
                onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </button>
              {headerMenuOpen && (
                <div className="vhp-header__menu">
                  <button
                    className={`vhp-header__menu-item${selectMode ? " vhp-header__menu-item--active" : ""}`}
                    onClick={() => {
                      setSelectMode(!selectMode);
                      setSelectedIds(new Set());
                      setHeaderMenuOpen(false);
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <polyline points="9 11 12 14 22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                    {selectMode ? "Exit selection" : "Select multiple"}
                  </button>
                </div>
              )}
            </div>
          )} */}
          {/* Pin button */}
          <button
            className={`vhp-header__pin-btn${pinned ? " vhp-header__pin-btn--active" : ""}${pinned && !canFitSidebar ? " vhp-header__pin-btn--warn" : ""}`}
            title={pinned ? (canFitSidebar ? "Unpin panel (currently docked)" : "Unpin panel (viewport too narrow to dock)") : "Pin panel to dock sidebar"}
            onClick={() => setPinned(!pinned)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 17v5" />
              <path d="M9 2h6l-1 7h-4L9 2z" />
              <path d="M6 12h12" />
              <path d="M8 9l-2 3" />
              <path d="M16 9l2 3" />
            </svg>
          </button>
          <button className="vhp-header__close" onClick={onClose} aria-label="Close version history" title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Narrow viewport warning when pinned but can't dock */}
      {pinned && !canFitSidebar && (
        <div className="vhp-dock-warn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Viewport too narrow to dock. Widen window or <button className="vhp-dock-warn__unpin" onClick={() => setPinned(false)}>unpin</button>.</span>
        </div>
      )}

      {/* Toolbar: search + filter dropdown + view dropdown — all on one line */}
      {!loading && snapshots.length > 0 && (
        <div className="vhp-toolbar">
          <div className="vhp-search">
            <svg className="vhp-search__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="vhp-search__input"
              type="text"
              placeholder="Search versions…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="vhp-search__clear" onClick={() => setSearchQuery("")}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
            {/* Filter dropdown */}
            <div className="vhp-dropdown" ref={filterDropdownRef}>
              <button
                className={`vhp-dropdown__trigger${filterDropdownOpen ? " vhp-dropdown__trigger--open" : ""}`}
                onClick={() => { setFilterDropdownOpen(!filterDropdownOpen); setViewDropdownOpen(false); }}
              >
                <span className="vhp-dropdown__label">
                  Show: {filter === "all" ? "All" : filter === "manual" ? "Manual" : filter === "auto" ? "Auto" : "Starred"}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {filterDropdownOpen && (
                <div className="vhp-dropdown__menu">
                  {/* All */}
                  <button
                    className={`vhp-dropdown__item${filter === "all" ? " vhp-dropdown__item--active" : ""}`}
                    onClick={() => { setFilter("all"); setFilterDropdownOpen(false); }}
                  >
                    <span className="vhp-dropdown__item-check">
                      {filter === "all" && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <svg className="vhp-dropdown__item-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="3" y1="15" x2="21" y2="15" />
                    </svg>
                    <span className="vhp-dropdown__item-label">All</span>
                    <span className="vhp-dropdown__item-count">{countAll}</span>
                  </button>
                  {/* Manual */}
                  <button
                    className={`vhp-dropdown__item${filter === "manual" ? " vhp-dropdown__item--active" : ""}`}
                    onClick={() => { setFilter("manual"); setFilterDropdownOpen(false); }}
                  >
                    <span className="vhp-dropdown__item-check">
                      {filter === "manual" && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <svg className="vhp-dropdown__item-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    <span className="vhp-dropdown__item-label">Manual</span>
                    <span className="vhp-dropdown__item-count">{countManual}</span>
                  </button>
                  {/* Auto */}
                  <button
                    className={`vhp-dropdown__item${filter === "auto" ? " vhp-dropdown__item--active" : ""}`}
                    onClick={() => { setFilter("auto"); setFilterDropdownOpen(false); }}
                  >
                    <span className="vhp-dropdown__item-check">
                      {filter === "auto" && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <svg className="vhp-dropdown__item-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span className="vhp-dropdown__item-label">Auto</span>
                    <span className="vhp-dropdown__item-count">{countAuto}</span>
                  </button>
                  {/* Starred */}
                  <button
                    className={`vhp-dropdown__item${filter === "starred" ? " vhp-dropdown__item--active" : ""}`}
                    onClick={() => { setFilter("starred"); setFilterDropdownOpen(false); }}
                  >
                    <span className="vhp-dropdown__item-check">
                      {filter === "starred" && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <svg className="vhp-dropdown__item-icon" width="13" height="13" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1.5">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span className="vhp-dropdown__item-label">Starred</span>
                    <span className="vhp-dropdown__item-count">{countStarred}</span>
                  </button>
                </div>
              )}
            </div>

            {/* View mode dropdown */}
            <div className="vhp-dropdown" ref={viewDropdownRef}>
              <button
                className={`vhp-dropdown__trigger${viewDropdownOpen ? " vhp-dropdown__trigger--open" : ""}`}
                onClick={() => { setViewDropdownOpen(!viewDropdownOpen); setFilterDropdownOpen(false); }}
              >
                {viewMode === "card" ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                ) : viewMode === "compact" ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="4" rx="1" />
                    <rect x="3" y="10" width="18" height="4" rx="1" />
                    <rect x="3" y="17" width="18" height="4" rx="1" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                )}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {viewDropdownOpen && (
                <div className="vhp-dropdown__menu">
                  <button
                    className={`vhp-dropdown__item${viewMode === "card" ? " vhp-dropdown__item--active" : ""}`}
                    onClick={() => { setViewMode("card"); setViewDropdownOpen(false); }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                    Grid view
                  </button>
                  <button
                    className={`vhp-dropdown__item${viewMode === "compact" ? " vhp-dropdown__item--active" : ""}`}
                    onClick={() => { setViewMode("compact"); setViewDropdownOpen(false); }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="4" rx="1" />
                      <rect x="3" y="10" width="18" height="4" rx="1" />
                      <rect x="3" y="17" width="18" height="4" rx="1" />
                    </svg>
                    Compact view
                  </button>
                  <button
                    className={`vhp-dropdown__item${viewMode === "list" ? " vhp-dropdown__item--active" : ""}`}
                    onClick={() => { setViewMode("list"); setViewDropdownOpen(false); }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" />
                      <line x1="3" y1="12" x2="3.01" y2="12" />
                      <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                    List view
                  </button>
                </div>
              )}
            </div>
        </div>
      )}

      {/* Search result count */}
      {!loading && searchQuery.trim() && (
        <div className="vhp-search-count">
          Showing {filteredSnapshots.length} of {snapshots.length} version{snapshots.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="vhp-skeleton-list">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="vhp-skeleton-card">
              <div className="vhp-skeleton-card__thumb" />
              <div className="vhp-skeleton-card__body">
                <div className="vhp-skeleton-card__line vhp-skeleton-card__line--title" />
                <div className="vhp-skeleton-card__line vhp-skeleton-card__line--time" />
                <div className="vhp-skeleton-card__line vhp-skeleton-card__line--badge" />
              </div>
            </div>
          ))}
        </div>
      ) : snapshots.length === 0 ? (
        <div className="vhp-empty">
          <div className="vhp-empty__icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="vhp-empty__title">No versions yet</div>
          <div className="vhp-empty__desc">
            Versions are created automatically every 5 minutes<br />and when you manually save.
          </div>
        </div>
      ) : filteredSnapshots.length === 0 ? (
        <div className="vhp-empty">
          <div className="vhp-empty__icon">
            {filter === "starred" ? (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            ) : filter === "manual" ? (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            ) : searchQuery.trim() ? (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            ) : (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            )}
          </div>
          <div className="vhp-empty__title">
            {filter === "starred" ? "No starred versions"
              : filter === "manual" ? "No manual saves yet"
                : filter === "auto" ? "No auto-saves yet"
                  : "No matching versions"}
          </div>
          <div className="vhp-empty__desc">
            {filter === "starred" ? "Star important versions to find them quickly."
              : filter === "manual" ? "Create one by clicking \"Save Now\" from the menu."
                : filter === "auto" ? "Auto-saves are created every 5 minutes while editing."
                  : searchQuery.trim() ? "Try a different search term or clear the filter."
                    : "Try adjusting your search or filter."}
          </div>
        </div>
      ) : (
        <div className={`vhp-list vhp-list--${viewMode}`} ref={listRef}>
          {groups.map((group) => (
            <div key={group.label} className="vhp-date-group">
              <div className="vhp-date-group__label">{group.label}</div>
              <div className={`vhp-date-group__cards vhp-date-group__cards--${viewMode}`}>
                {group.items.map((snap) => {
                  const flatIdx = filteredSnapshots.findIndex((s) => s.$id === snap.$id);
                  const isFocused = flatIdx === focusedIdx;
                  const isActive = previewSnapshot?.$id === snap.$id;
                  const displayName = snap.customName || generateAutoTitle(snap);
                  const isRestore = snap.trigger === "restore";
                  const relTime = formatRelativeTime(snap.timestamp);

                  // ── Resolve source version for restore snapshots ──
                  const sourceSnap = isRestore && snap.restoredFromVersionId
                    ? sourceVersions[snap.restoredFromVersionId]
                    : undefined;
                  const sourceTitle = sourceSnap
                    ? (sourceSnap.customName || generateAutoTitle(sourceSnap))
                    : undefined;
                  const sourceTime = sourceSnap
                    ? formatPrimaryTime(sourceSnap.timestamp)
                    : undefined;
                  const sourceDeleted = isRestore && snap.restoredFromVersionId
                    && snap.restoredFromVersionId in sourceVersions
                    && sourceVersions[snap.restoredFromVersionId] === null;

                  // ── List view row ──
                  if (viewMode === "list") {
                    return (
                      <div
                        key={snap.$id}
                        data-snapshot-id={snap.$id}
                        className={`vhp-list-row${isActive ? " vhp-list-row--active" : ""}${isFocused ? " vhp-list-row--focused" : ""}${snap.starred ? " vhp-list-row--starred" : ""}${highlightedCardId === snap.$id ? " vhp-list-row--highlight" : ""}${menuOpenId === snap.$id ? " vhp-list-row--menu-open" : ""}`}
                        onClick={() => {
                          if (selectMode) { toggleSelect(snap.$id); }
                          else if (editingId !== snap.$id) { handleSelectVersion(snap); }
                        }}
                        tabIndex={0}
                        onFocus={() => setFocusedIdx(flatIdx)}
                      >
                        {/* Left: checkbox or star toggle */}
                        {selectMode ? (
                          <label className="vhp-list-row__checkbox" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={selectedIds.has(snap.$id)} onChange={() => toggleSelect(snap.$id)} />
                          </label>
                        ) : (
                          <button
                            className="vhp-list-row__star-btn"
                            title={snap.starred ? "Unstar" : "Star"}
                            onClick={(e) => { e.stopPropagation(); handleToggleStar(snap.$id, !!snap.starred); }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill={snap.starred ? "#f59e0b" : "none"} stroke={snap.starred ? "#f59e0b" : "currentColor"} strokeWidth="1.5">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                          </button>
                        )}

                        {/* Center: content */}
                        <div className="vhp-list-row__content">
                          <div className="vhp-list-row__main">
                            {editingId === snap.$id ? (
                              <input
                                ref={renameInputRef}
                                className="vhp-list-row__rename-input"
                                type="text"
                                value={editingName}
                                placeholder="Version name…"
                                onChange={(e) => setEditingName(e.target.value)}
                                onBlur={commitRename}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { commitRename(); }
                                  if (e.key === "Escape") { setEditingId(null); setEditingName(""); }
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span
                                className="vhp-list-row__title"
                                title={displayName}
                                onClick={(e) => { e.stopPropagation(); startRename(snap); }}
                              >
                                <HighlightText text={displayName} query={searchQuery} />
                              </span>
                            )}
                            {(snap.trigger || "auto") !== "manual" && (
                              <span className={`vhp-card__trigger vhp-card__trigger--${isRestore ? "restore" : "auto"}`}>
                                AUTO
                              </span>
                            )}
                          </div>
                          <div className="vhp-list-row__time-row">
                            <span className="vhp-list-row__time">
                              <HighlightText text={formatPrimaryTime(snap.timestamp)} query={searchQuery} />
                            </span>
                            {relTime && (
                              <>
                                <span className="vhp-list-row__time-sep">•</span>
                                <span className="vhp-list-row__time-rel">{relTime}</span>
                              </>
                            )}
                          </div>
                          {isRestore && snap.restoredFromVersionId && (
                            <div className="vhp-list-row__restored-from">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                              {sourceDeleted ? (
                                <span className="vhp-list-row__restored-from-text">Original version deleted</span>
                              ) : sourceSnap ? (
                                <>
                                  <span className="vhp-list-row__restored-from-text">
                                    From: {sourceTitle} ({sourceTime})
                                  </span>
                                  <button
                                    className="vhp-list-row__view-link"
                                    title="View original version"
                                    onClick={(e) => { e.stopPropagation(); scrollToSourceVersion(snap.restoredFromVersionId); }}
                                  >
                                    View ↗
                                  </button>
                                </>
                              ) : (
                                <span className="vhp-list-row__restored-from-text">Loading…</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Right: restore + three-dot menu */}
                        <div className="vhp-list-row__actions">
                          <button className="vhp-list-row__action-btn" title="Restore" onClick={(e) => { e.stopPropagation(); handleCardRestore(snap); }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                          </button>
                          {/* Three-dot menu for list view - HIDDEN */}
                          {/* {!selectMode && (
                            <div className="vhp-card__menu-wrap">
                              <button
                                className="vhp-list-row__action-btn"
                                title="More actions"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (menuOpenId === snap.$id) {
                                    setMenuOpenId(null);
                                    setMenuPosition(null);
                                  } else {
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    const menuH = 140;
                                    const spaceBelow = window.innerHeight - rect.bottom;
                                    const top = spaceBelow < menuH ? rect.top - menuH : rect.bottom + 4;
                                    setMenuPosition({ top, left: rect.right - 140 });
                                    setMenuOpenId(snap.$id);
                                  }
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                  <circle cx="12" cy="5" r="2" />
                                  <circle cx="12" cy="12" r="2" />
                                  <circle cx="12" cy="19" r="2" />
                                </svg>
                              </button>
                            </div>
                          )} */}
                        </div>
                      </div>
                    );
                  }

                  // ── Card view (full or compact) ──
                  return (
                    <div
                      key={snap.$id}
                      data-snapshot-id={snap.$id}
                      className={`vhp-card${isActive ? " vhp-card--active" : ""}${isFocused ? " vhp-card--focused" : ""}${snap.starred ? " vhp-card--starred" : ""}${viewMode === "compact" ? " vhp-card--compact" : ""}${highlightedCardId === snap.$id ? " vhp-card--highlight" : ""}${menuOpenId === snap.$id ? " vhp-card--menu-open" : ""}`}
                      onClick={() => {
                        if (selectMode) {
                          toggleSelect(snap.$id);
                        } else if (editingId !== snap.$id) {
                          handleSelectVersion(snap);
                        }
                      }}
                      tabIndex={0}
                      onFocus={() => setFocusedIdx(flatIdx)}
                    >
                      {/* Checkbox for bulk select - top-left corner */}
                      {selectMode && (
                        <label className="vhp-card__checkbox" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(snap.$id)}
                            onChange={() => toggleSelect(snap.$id)}
                          />
                        </label>
                      )}

                      {/* Thumbnail (only in full card view) */}
                      {viewMode === "card" && (
                        <VersionThumbnail canvasData={snap.canvasData} isDark={isDark} />
                      )}

                      {/* Card body */}
                      <div className="vhp-card__body">
                        {/* Horizontal title + time row */}
                        <div className="vhp-card__title-row">
                          {editingId === snap.$id ? (
                            <input
                              ref={renameInputRef}
                              className="vhp-card__rename-input"
                              type="text"
                              value={editingName}
                              placeholder="Version name…"
                              onChange={(e) => setEditingName(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { commitRename(); }
                                if (e.key === "Escape") { setEditingId(null); setEditingName(""); }
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span
                              className="vhp-card__title"
                              title={displayName}
                              onClick={(e) => { e.stopPropagation(); startRename(snap); }}
                            >
                              <HighlightText text={displayName} query={searchQuery} />
                            </span>
                          )}
                        </div>

                        {/* Timestamp + relative time on same line */}
                        <div className="vhp-card__time-row">
                          <span className="vhp-card__time-inline">
                            <HighlightText text={formatPrimaryTime(snap.timestamp)} query={searchQuery} />
                          </span>
                          {relTime && (
                            <>
                              <span className="vhp-card__time-sep">•</span>
                              <span className="vhp-card__time-relative">{relTime}</span>
                            </>
                          )}
                        </div>

                        {/* Nested restored-from source card */}
                        {isRestore && snap.restoredFromVersionId && (
                          <div className="vhp-source-card" onClick={(e) => e.stopPropagation()}>
                            <div className="vhp-source-card__header">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                              <span className="vhp-source-card__label">Restored from:</span>
                            </div>
                            {sourceDeleted ? (
                              <div className="vhp-source-card__deleted">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                  <line x1="9" y1="9" x2="15" y2="15" />
                                  <line x1="15" y1="9" x2="9" y2="15" />
                                </svg>
                                <span>Original version no longer available</span>
                              </div>
                            ) : sourceSnap ? (
                              <>
                                {viewMode === "card" && (
                                  <MiniSourceThumbnail canvasData={sourceSnap.canvasData} isDark={isDark} />
                                )}
                                <div className="vhp-source-card__info">
                                  <span className="vhp-source-card__title">{sourceTitle}</span>
                                  <span className="vhp-source-card__sep">•</span>
                                  <span className="vhp-source-card__time">{sourceTime}</span>
                                </div>
                                <div className="vhp-source-card__meta">
                                  {(sourceSnap.trigger || "auto") !== "manual" && (
                                    <span className={`vhp-card__trigger vhp-card__trigger--${sourceSnap.trigger === "restore" ? "restore" : "auto"}`}>
                                      AUTO
                                    </span>
                                  )}
                                  {/* Chain indicator for sequential restores */}
                                  {sourceSnap.trigger === "restore" && sourceSnap.restoredFromVersionId && (
                                    <span className="vhp-source-card__chain">
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                                      Also a restore
                                    </span>
                                  )}
                                </div>
                                <button
                                  className="vhp-source-card__view-link"
                                  title="View original version"
                                  onClick={(e) => { e.stopPropagation(); scrollToSourceVersion(snap.restoredFromVersionId); }}
                                >
                                  View original ↗
                                </button>
                              </>
                            ) : (
                              <div className="vhp-source-card__loading">
                                <div className="vhp-loading__spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />
                                <span>Loading source version…</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Footer: trigger badge + action buttons */}
                        <div className="vhp-card__footer">
                          {(snap.trigger || "auto") !== "manual" ? (
                            <span className={`vhp-card__trigger vhp-card__trigger--${isRestore ? "restore" : "auto"}`}>
                              AUTO
                            </span>
                          ) : (
                            <span />
                          )}
                          <div className="vhp-card__actions">
                            <button
                              className="vhp-card__action-btn vhp-card__action-btn--delete"
                              title="Delete this version"
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(snap.$id); }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                            <button
                              className="vhp-card__action-btn vhp-card__action-btn--restore"
                              title="Restore this version"
                              onClick={(e) => { e.stopPropagation(); handleCardRestore(snap); }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="1 4 1 10 7 10" />
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                              </svg>
                              Restore
                            </button>
                            <button
                              className="vhp-card__action-btn"
                              title={snap.starred ? "Unstar" : "Star"}
                              onClick={(e) => { e.stopPropagation(); handleToggleStar(snap.$id, !!snap.starred); }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill={snap.starred ? "#f59e0b" : "none"} stroke={snap.starred ? "#f59e0b" : "currentColor"} strokeWidth="1.5">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                            </button>
                            {/* Three-dot menu for secondary actions - HIDDEN */}
                            {/* {!selectMode && (
                              <div className="vhp-card__menu-wrap">
                                <button
                                  className="vhp-card__action-btn"
                                  title="More actions"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (menuOpenId === snap.$id) {
                                      setMenuOpenId(null);
                                      setMenuPosition(null);
                                    } else {
                                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                      const menuH = 140;
                                      const spaceBelow = window.innerHeight - rect.bottom;
                                      const top = spaceBelow < menuH ? rect.top - menuH : rect.bottom + 4;
                                      setMenuPosition({ top, left: rect.right - 140 });
                                      setMenuOpenId(snap.$id);
                                    }
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="12" cy="5" r="2" />
                                    <circle cx="12" cy="12" r="2" />
                                    <circle cx="12" cy="19" r="2" />
                                  </svg>
                                </button>
                              </div>
                            )} */}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fixed-position three-dot menu (rendered outside scroll container to avoid clipping) */}
      {menuOpenId && menuPosition && (() => {
        const snap = snapshots.find((s) => s.$id === menuOpenId);
        if (!snap) return null;
        return (
          <div
            ref={menuRef}
            className="vhp-card__menu vhp-card__menu--fixed"
            style={{ position: "fixed", top: menuPosition.top, left: menuPosition.left, zIndex: 200 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="vhp-card__menu-item" onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); setMenuPosition(null); startRename(snap); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Rename
            </button>
            <button className="vhp-card__menu-item" onClick={(e) => {
              e.stopPropagation();
              setMenuOpenId(null);
              setMenuPosition(null);
              handleSelectVersion(snap).then(() => handleCompare());
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="7" height="18" rx="1" />
                <rect x="14" y="3" width="7" height="18" rx="1" />
              </svg>
              Compare
            </button>
            <div className="vhp-card__menu-divider" />
            <button className="vhp-card__menu-item vhp-card__menu-item--danger" onClick={(e) => {
              e.stopPropagation();
              const id = menuOpenId;
              setMenuOpenId(null);
              setMenuPosition(null);
              setDeleteConfirmId(id);
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Delete
            </button>
          </div>
        );
      })()}

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div className="vhp-confirm-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="vhp-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="vhp-confirm__title">Delete version?</div>
            <div className="vhp-confirm__desc">This cannot be undone.</div>
            <div className="vhp-confirm__actions">
              <button className="vhp-confirm__cancel" onClick={() => setDeleteConfirmId(null)} disabled={deleting}>Cancel</button>
              <button className="vhp-confirm__delete" onClick={() => handleDelete(deleteConfirmId)} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore confirmation dialog — enhanced with preview + backup name */}
      {restoreConfirmSnap && (
        <div className="vhp-confirm-overlay" onClick={() => setRestoreConfirmSnap(null)}>
          <div className="vhp-confirm vhp-confirm--restore" onClick={(e) => e.stopPropagation()}>
            <div className="vhp-confirm__icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="vhp-confirm__title">Restore this version?</div>
            <div className="vhp-confirm__desc">
              Restoring will replace your current work with <strong>{restoreConfirmSnap.customName || generateAutoTitle(restoreConfirmSnap)}</strong> from{" "}
              <strong>{formatPreviewDate(restoreConfirmSnap.timestamp)}</strong>.
            </div>

            {/* Side-by-side preview thumbnails */}
            <div className="vhp-restore-preview">
              <div className="vhp-restore-preview__pane">
                <div className="vhp-restore-preview__label">Current Version</div>
                <div className="vhp-restore-preview__name">Will be saved as: <strong>{restoreBackupName.trim() || "Untitled backup"}</strong></div>
                <div className="vhp-restore-preview__thumb">
                  {restoreCurrentData ? (
                    <VersionThumbnail canvasData={restoreCurrentData} isDark={isDark} />
                  ) : (
                    <div className="vhp-thumb vhp-thumb--empty" style={{ height: 80 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
              <div className="vhp-restore-preview__arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
              <div className="vhp-restore-preview__pane">
                <div className="vhp-restore-preview__label">Restoring to</div>
                <div className="vhp-restore-preview__name"><strong>{restoreConfirmSnap.customName || generateAutoTitle(restoreConfirmSnap)}</strong></div>
                <div className="vhp-restore-preview__date">{formatPreviewDate(restoreConfirmSnap.timestamp)}</div>
                <div className="vhp-restore-preview__thumb">
                  <VersionThumbnail canvasData={restoreConfirmSnap.canvasData} isDark={isDark} />
                </div>
              </div>
            </div>

            {/* Editable backup name */}
            <div className="vhp-restore-backup">
              <label className="vhp-restore-backup__label">Current state will be saved as:</label>
              <input
                className="vhp-restore-backup__input"
                type="text"
                value={restoreBackupName}
                onChange={(e) => setRestoreBackupName(e.target.value)}
                placeholder="Backup name…"
              />
            </div>

            <div className="vhp-confirm__actions">
              <button className="vhp-confirm__cancel" onClick={() => setRestoreConfirmSnap(null)} disabled={restoring}>Cancel</button>
              <button className="vhp-confirm__delete vhp-confirm__restore-btn" onClick={handleRestoreConfirm} disabled={restoring}>
                {restoring ? "Restoring…" : "Restore"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version preview modal dialog */}
      {previewSnapshot && (
        <div className="vhp-modal-overlay" onClick={handleClosePreview}>
          <div className={`vhp-modal${compareData ? " vhp-modal--compare" : ""}`} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="vhp-modal__header">
              <div className="vhp-modal__title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" fill="none" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <div className="vhp-modal__title-content">
                  <span className="vhp-modal__title-name">
                    {previewSnapshot.customName || generateAutoTitle(previewSnapshot)}
                  </span>
                  <span className="vhp-modal__title-sep">•</span>
                  <span className="vhp-modal__title-time">
                    {formatPreviewDate(previewSnapshot.timestamp)}
                  </span>
                </div>
              </div>
              {(previewSnapshot.trigger || "auto") !== "manual" && (
                <div className="vhp-modal__badge">
                  <span className={`vhp-card__trigger vhp-card__trigger--${previewSnapshot.trigger === "restore" ? "restore" : "auto"}`}>
                    AUTO
                  </span>
                </div>
              )}
              {!compareData && (
                <button className="vhp-modal__compare-btn" onClick={handleCompare} title="Compare with current">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="7" height="18" rx="1" />
                    <rect x="14" y="3" width="7" height="18" rx="1" />
                  </svg>
                  Compare
                </button>
              )}
              {compareData && (
                <button className="vhp-modal__compare-btn vhp-modal__compare-btn--active" onClick={() => setCompareData(null)}>
                  Exit Compare
                </button>
              )}
              <button className="vhp-modal__close" onClick={handleClosePreview} aria-label="Close preview">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Body with canvas */}
            <div className="vhp-modal__body">
              {loadingPreview ? (
                <div className="vhp-loading">
                  <div className="vhp-loading__spinner" />
                </div>
              ) : compareData ? (
                <div className="vhp-compare">
                  <div className={`vhp-compare__pane${compareSwapped ? ' vhp-compare__pane--highlight' : ''}`}>
                    <div className={`vhp-compare__header${compareSwapped ? ' vhp-compare__header--highlight' : ''}`}>
                      <div className="vhp-compare__title-content">
                        {!compareSwapped && (
                          <span className="vhp-compare__label">Current</span>
                        )}
                        {compareSwapped && (
                          <>
                            <span className="vhp-compare__name">
                              {compareSnapshotB ? (compareSnapshotB.customName || generateAutoTitle(compareSnapshotB)) : (previewSnapshot?.customName || generateAutoTitle(previewSnapshot))}
                            </span>
                            <span className="vhp-compare__sep">•</span>
                            <span className="vhp-compare__date">
                              {formatPreviewDate(compareSnapshotB ? compareSnapshotB.timestamp : previewSnapshot!.timestamp)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="vhp-compare__canvas-container">
                      {renderPreviewCanvas(compareSwapped ? compareData : previewData, 440, 500, compareSwapped ? compareCanvasRef : singleCanvasRef)}
                      {/* Floating zoom controls on version-to-restore */}
                      {compareSwapped && (
                        <div className="vhp-floating-zoom">
                          <button className="vhp-floating-zoom__btn" title="Zoom out (Ctrl+-)" onClick={zoomOut} disabled={zoom <= ZOOM_MIN}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
                            </svg>
                          </button>
                          <span className="vhp-floating-zoom__level">{Math.round(zoom * 100)}%</span>
                          <button className="vhp-floating-zoom__btn" title="Zoom in (Ctrl+=)" onClick={zoomIn} disabled={zoom >= ZOOM_MAX}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                            </svg>
                          </button>
                          <button className="vhp-floating-zoom__btn vhp-floating-zoom__btn--fit" title="Fit to screen (Ctrl+0)" onClick={fitToScreen}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="vhp-compare__divider">
                    <div className="vhp-compare__divider-btns">
                      <button
                        className="vhp-compare__swap-btn"
                        title="Switch sides"
                        onClick={() => setCompareSwapped(!compareSwapped)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="17 1 21 5 17 9" />
                          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                          <polyline points="7 23 3 19 7 15" />
                          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                        </svg>
                      </button>
                      <button
                        className="vhp-compare__fit-btn"
                        title="Fit to view"
                        onClick={() => {
                          setCompareZoomA(1); setComparePanAX(0); setComparePanAY(0);
                          setCompareZoomB(1); setComparePanBX(0); setComparePanBY(0);
                          setZoom(1); setPanX(0); setPanY(0);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className={`vhp-compare__pane${!compareSwapped ? ' vhp-compare__pane--highlight' : ''}`}>
                    <div className={`vhp-compare__header${!compareSwapped ? ' vhp-compare__header--highlight' : ''}`}>
                      <div className="vhp-compare__title-content">
                        {compareSwapped && (
                          <span className="vhp-compare__label">Current</span>
                        )}
                        {!compareSwapped && (
                          <>
                            <span className="vhp-compare__name">
                              {compareSnapshotB ? (compareSnapshotB.customName || generateAutoTitle(compareSnapshotB)) : (previewSnapshot?.customName || generateAutoTitle(previewSnapshot))}
                            </span>
                            <span className="vhp-compare__sep">•</span>
                            <span className="vhp-compare__date">
                              {compareSnapshotB ? formatPreviewDate(compareSnapshotB.timestamp) : formatPreviewDate(previewSnapshot!.timestamp)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="vhp-compare__canvas-container">
                      {renderPreviewCanvas(compareSwapped ? previewData : compareData, 440, 500, compareSwapped ? singleCanvasRef : compareCanvasRef)}
                      {/* Floating zoom controls on version-to-restore */}
                      {!compareSwapped && (
                        <div className="vhp-floating-zoom">
                          <button className="vhp-floating-zoom__btn" title="Zoom out (Ctrl+-)" onClick={zoomOut} disabled={zoom <= ZOOM_MIN}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
                            </svg>
                          </button>
                          <span className="vhp-floating-zoom__level">{Math.round(zoom * 100)}%</span>
                          <button className="vhp-floating-zoom__btn" title="Zoom in (Ctrl+=)" onClick={zoomIn} disabled={zoom >= ZOOM_MAX}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                            </svg>
                          </button>
                          <button className="vhp-floating-zoom__btn vhp-floating-zoom__btn--fit" title="Fit to screen (Ctrl+0)" onClick={fitToScreen}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="vhp-modal__canvas-container">
                  {renderPreviewCanvas(previewData, 900, 560, singleCanvasRef)}
                  {/* Floating zoom controls for single preview */}
                  <div className="vhp-floating-zoom">
                    <button className="vhp-floating-zoom__btn" title="Zoom out (Ctrl+-)" onClick={zoomOut} disabled={zoom <= ZOOM_MIN}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
                      </svg>
                    </button>
                    <span className="vhp-floating-zoom__level">{Math.round(zoom * 100)}%</span>
                    <button className="vhp-floating-zoom__btn" title="Zoom in (Ctrl+=)" onClick={zoomIn} disabled={zoom >= ZOOM_MAX}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                      </svg>
                    </button>
                    <button className="vhp-floating-zoom__btn vhp-floating-zoom__btn--fit" title="Fit to screen (Ctrl+0)" onClick={fitToScreen}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="vhp-modal__footer">
              {/* Version navigation pager - left side */}
              {!loadingPreview && previewData && (
                <div className="vhp-modal__pager">
                  <button className="vhp-modal__pager-btn" title="Previous version (←)" disabled={!hasPrev} onClick={() => navigatePreview(-1)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <span className="vhp-modal__pager-pos">{previewIdx + 1} / {filteredSnapshots.length}</span>
                  <button className="vhp-modal__pager-btn" title="Next version (→)" disabled={!hasNext} onClick={() => navigatePreview(1)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              )}
              
              {/* Action buttons - right side */}
              <div className="vhp-modal__footer-actions">
                <button className="vhp-modal__btn vhp-modal__btn--secondary" onClick={handleClosePreview}>Close</button>
                <button className="vhp-modal__btn vhp-modal__btn--primary" onClick={handleRestoreClick} disabled={restoring || loadingPreview}>
                  {restoring ? "Restoring…" : "Restore This Version"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating action bar for select mode (Google Drive style) - HIDDEN */}
      {/* {selectMode && selectedIds.size > 0 && (() => {
        const anyStarred = snapshots.some((s) => selectedIds.has(s.$id) && s.starred);
        const allStarred = snapshots.filter((s) => selectedIds.has(s.$id)).every((s) => s.starred);
        return (
          <div className="vhp-floating-bar">
            <span className="vhp-floating-bar__count">{selectedIds.size} selected</span>
            <div className="vhp-floating-bar__actions">
              <button className="vhp-floating-bar__btn" onClick={handleSelectAll} title="Select all">
                All
              </button>
              <button className="vhp-floating-bar__btn" onClick={handleDeselectAll} title="Deselect all">
                Clear
              </button>
              {allStarred ? (
                <button className="vhp-floating-bar__btn" onClick={handleBulkUnstar} disabled={selectedIds.size === 0} title="Unstar selected">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  Unstar
                </button>
              ) : (
                <button className="vhp-floating-bar__btn" onClick={handleBulkStar} disabled={selectedIds.size === 0} title={anyStarred ? "Star all selected" : "Star selected"}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  Star
                </button>
              )}
              <button className="vhp-floating-bar__btn vhp-floating-bar__btn--danger" onClick={() => setBulkDeleteConfirm(true)} disabled={selectedIds.size === 0 || deleting} title="Delete selected">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Delete
              </button>
            </div>
            <button className="vhp-floating-bar__close" onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }} title="Exit selection">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );
      })()} */}

      {/* Bulk delete confirmation dialog */}
      {bulkDeleteConfirm && (
        <div className="vhp-confirm-overlay" onClick={() => setBulkDeleteConfirm(false)}>
          <div className="vhp-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="vhp-confirm__title">Delete {selectedIds.size} version{selectedIds.size !== 1 ? "s" : ""}?</div>
            <div className="vhp-confirm__desc">This cannot be undone. All selected versions will be permanently removed.</div>
            <div className="vhp-confirm__actions">
              <button className="vhp-confirm__cancel" onClick={() => setBulkDeleteConfirm(false)} disabled={deleting}>Cancel</button>
              <button className="vhp-confirm__delete" onClick={() => { setBulkDeleteConfirm(false); handleBulkDelete(); }} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
