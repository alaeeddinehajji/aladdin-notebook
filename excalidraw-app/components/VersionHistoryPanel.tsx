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
  onRestore: (canvasData: object, snapshotTimestamp: string) => void;
  onClose: () => void;
};

type FilterType = "all" | "manual" | "auto" | "starred";

// ─── Auto-generated title from canvas data ──────────────────────────────────

const generateAutoTitle = (snap: VersionSnapshot): string => {
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
    ? "Manual save"
    : trigger === "restore"
      ? "Before restore"
      : "Auto";

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
}: VersionHistoryPanelProps) => {
  const [snapshots, setSnapshots] = useState<VersionSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  // Touch/pinch zoom refs
  const touchStartDistRef = useRef(0);
  const touchStartZoomRef = useRef(1);
  const touchStartPanRef = useRef({ x: 0, y: 0 });

  // Three-dot menu
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Close three-dot menu on outside click
  useEffect(() => {
    if (!menuOpenId) {
      return;
    }
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpenId]);

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
      setZoom(1);
      setPanX(0);
      setPanY(0);
      try {
        const full = await getVersionSnapshot(snapshot.$id);
        if (full) {
          setPreviewData(JSON.parse(full.canvasData));
        }
      } catch (err) {
        console.error("Failed to load version data:", err);
      } finally {
        setLoadingPreview(false);
      }
    },
    [],
  );

  const handleClosePreview = useCallback(() => {
    setPreviewSnapshot(null);
    setPreviewData(null);
    setCompareData(null);
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const handleRestoreClick = useCallback(() => {
    if (!previewSnapshot) {
      return;
    }
    setRestoreConfirmSnap(previewSnapshot);
  }, [previewSnapshot]);

  const handleCardRestore = useCallback((snap: VersionSnapshot) => {
    setRestoreConfirmSnap(snap);
  }, []);

  const handleRestoreConfirm = useCallback(async () => {
    if (!restoreConfirmSnap || restoring) {
      return;
    }
    setRestoring(true);
    try {
      const full = await getVersionSnapshot(restoreConfirmSnap.$id);
      if (full) {
        onRestore(JSON.parse(full.canvasData), full.timestamp);
        setRestoreConfirmSnap(null);
        handleClosePreview();
      }
    } catch (err) {
      console.error("Failed to restore version:", err);
    } finally {
      setRestoring(false);
    }
  }, [restoreConfirmSnap, restoring, onRestore, handleClosePreview]);

  const navigatePreview = useCallback(
    (direction: -1 | 1) => {
      if (!previewSnapshot) {
        return;
      }
      const idx = filteredSnapshots.findIndex((s) => s.$id === previewSnapshot.$id);
      if (idx < 0) {
        return;
      }
      const nextIdx = idx + direction;
      if (nextIdx >= 0 && nextIdx < filteredSnapshots.length) {
        handleSelectVersion(filteredSnapshots[nextIdx]);
      }
    },
    [previewSnapshot, filteredSnapshots, handleSelectVersion],
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

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) {
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
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [previewData]);

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

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        touchStartDistRef.current = getTouchDistance(e.touches[0], e.touches[1]);
        touchStartZoomRef.current = zoom;
        const center = getTouchCenter(e.touches[0], e.touches[1]);
        touchStartPanRef.current = { x: center.x - panX, y: center.y - panY };
      }
    },
    [zoom, panX, panY],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getTouchDistance(e.touches[0], e.touches[1]);
        const scale = dist / touchStartDistRef.current;
        const newZoom = Math.min(Math.max(touchStartZoomRef.current * scale, ZOOM_MIN), ZOOM_MAX);
        setZoom(newZoom);
        const center = getTouchCenter(e.touches[0], e.touches[1]);
        setPanX(center.x - touchStartPanRef.current.x);
        setPanY(center.y - touchStartPanRef.current.y);
      }
    },
    [],
  );

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
        } else {
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
    previewSnapshot, deleteConfirmId, restoreConfirmSnap, selectMode,
    focusedIdx, filteredSnapshots, onClose, handleClosePreview,
    navigatePreview, handleSelectVersion, handleToggleStar,
    zoomIn, zoomOut, fitToScreen,
  ]);

  // ─── Preview canvas renderer ─────────────────────────────────────────────

  const renderPreviewCanvas = (data: object | null, canvasW = 900, canvasH = 560) => {
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
        ref={canvasContainerRef}
        className="vhp-modal__canvas-wrap"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
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
    <div className={`version-history-panel${isDark ? " version-history-panel--dark" : ""}`}>
      {/* Header */}
      <div className="vhp-header">
        <div className="vhp-header__title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Version history
          {!loading && snapshots.length > 0 && (
            <span className="vhp-header__count">{snapshots.length}</span>
          )}
        </div>
        <div className="vhp-header__actions">
          {!loading && snapshots.length > 1 && (
            <button
              className={`vhp-header__select-btn${selectMode ? " vhp-header__select-btn--active" : ""}`}
              title="Select multiple"
              onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </button>
          )}
          <button className="vhp-header__close" onClick={onClose} aria-label="Close version history">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="vhp-bulk-bar">
          <span className="vhp-bulk-bar__count">{selectedIds.size} selected</span>
          <div className="vhp-bulk-bar__actions">
            <button className="vhp-bulk-bar__btn" onClick={handleBulkStar}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Star
            </button>
            <button className="vhp-bulk-bar__btn vhp-bulk-bar__btn--danger" onClick={handleBulkDelete} disabled={deleting}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}

      {/* Toolbar: search + filter */}
      {!loading && snapshots.length > 0 && (
        <div className="vhp-toolbar">
          <div className="vhp-search">
            <svg className="vhp-search__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <div className="vhp-filters">
            {(["all", "manual", "auto", "starred"] as FilterType[]).map((f) => {
              const count = f === "all" ? countAll : f === "manual" ? countManual : f === "auto" ? countAuto : countStarred;
              return (
                <button
                  key={f}
                  className={`vhp-filters__btn${filter === f ? " vhp-filters__btn--active" : ""}`}
                  onClick={() => setFilter(f)}
                >
                  {f === "starred" ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={filter === "starred" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  ) : (
                    f === "all" ? "All" : f === "manual" ? "Manual" : "Auto"
                  )}
                  {count > 0 && <span className="vhp-filters__count">{count}</span>}
                </button>
              );
            })}
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
        <div className="vhp-list" ref={listRef}>
          {groups.map((group) => (
            <div key={group.label} className="vhp-date-group">
              <div className="vhp-date-group__label">{group.label}</div>
              <div className="vhp-date-group__cards">
                {group.items.map((snap) => {
                  const flatIdx = filteredSnapshots.findIndex((s) => s.$id === snap.$id);
                  const isFocused = flatIdx === focusedIdx;
                  const isActive = previewSnapshot?.$id === snap.$id;
                  const displayName = snap.customName || generateAutoTitle(snap);

                  return (
                    <div
                      key={snap.$id}
                      className={`vhp-card${isActive ? " vhp-card--active" : ""}${isFocused ? " vhp-card--focused" : ""}`}
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
                      {/* Checkbox for bulk select */}
                      {selectMode && (
                        <label className="vhp-card__checkbox" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(snap.$id)}
                            onChange={() => toggleSelect(snap.$id)}
                          />
                          <span className="vhp-card__checkmark" />
                        </label>
                      )}

                      {/* Thumbnail */}
                      <VersionThumbnail canvasData={snap.canvasData} isDark={isDark} />

                      {/* Card body */}
                      <div className="vhp-card__body">
                        {/* Title row */}
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
                              onDoubleClick={(e) => { e.stopPropagation(); startRename(snap); }}
                            >
                              <HighlightText text={displayName} query={searchQuery} />
                            </span>
                          )}
                          {snap.starred && (
                            <svg className="vhp-card__star-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                          )}
                        </div>

                        {/* Time display */}
                        <div className="vhp-card__time">
                          <span className="vhp-card__time-primary">
                            <HighlightText text={formatPrimaryTime(snap.timestamp)} query={searchQuery} />
                          </span>
                          {(() => {
                            const rel = formatRelativeTime(snap.timestamp);
                            return rel ? <span className="vhp-card__time-relative">{rel}</span> : null;
                          })()}
                        </div>

                        {/* Trigger badge + restore button */}
                        <div className="vhp-card__footer">
                          <span className={`vhp-card__trigger vhp-card__trigger--${snap.trigger || "auto"}`}>
                            {triggerLabel(snap.trigger || "auto")}
                          </span>
                          <button
                            className="vhp-card__restore"
                            title="Restore this version"
                            onClick={(e) => { e.stopPropagation(); handleCardRestore(snap); }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="1 4 1 10 7 10" />
                              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                            </svg>
                            Restore
                          </button>
                        </div>
                      </div>

                      {/* Three-dot menu */}
                      {!selectMode && (
                        <div className="vhp-card__menu-wrap" ref={menuOpenId === snap.$id ? menuRef : undefined}>
                          <button
                            className="vhp-card__menu-btn"
                            onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === snap.$id ? null : snap.$id); }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="5" r="2" />
                              <circle cx="12" cy="12" r="2" />
                              <circle cx="12" cy="19" r="2" />
                            </svg>
                          </button>
                          {menuOpenId === snap.$id && (
                            <div className="vhp-card__menu">
                              <button className="vhp-card__menu-item" onClick={(e) => { e.stopPropagation(); startRename(snap); }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                Rename
                              </button>
                              <button className="vhp-card__menu-item" onClick={(e) => {
                                e.stopPropagation();
                                handleToggleStar(snap.$id, !!snap.starred);
                                setMenuOpenId(null);
                              }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill={snap.starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                </svg>
                                {snap.starred ? "Unstar" : "Star"}
                              </button>
                              <button className="vhp-card__menu-item" onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenId(null);
                                handleSelectVersion(snap).then(() => handleCompare());
                              }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="3" y="3" width="7" height="18" rx="1" />
                                  <rect x="14" y="3" width="7" height="18" rx="1" />
                                </svg>
                                Compare
                              </button>
                              <div className="vhp-card__menu-divider" />
                              <button className="vhp-card__menu-item vhp-card__menu-item--danger" onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenId(null);
                                setDeleteConfirmId(snap.$id);
                              }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

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

      {/* Restore confirmation dialog */}
      {restoreConfirmSnap && (
        <div className="vhp-confirm-overlay" onClick={() => setRestoreConfirmSnap(null)}>
          <div className="vhp-confirm vhp-confirm--restore" onClick={(e) => e.stopPropagation()}>
            <div className="vhp-confirm__icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="vhp-confirm__title">Restore this version?</div>
            <div className="vhp-confirm__desc">
              Restoring will replace your current work with the version from{" "}
              <strong>{formatPreviewDate(restoreConfirmSnap.timestamp)}</strong>.
              A backup of your current state will be saved automatically.
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {previewSnapshot.customName
                  ? `${previewSnapshot.customName} — ${formatPreviewDate(previewSnapshot.timestamp)}`
                  : `Version Preview — ${formatPreviewDate(previewSnapshot.timestamp)}`}
              </div>
              <div className="vhp-modal__badge">
                <span className={`vhp-card__trigger vhp-card__trigger--${previewSnapshot.trigger || "auto"}`}>
                  {triggerLabel(previewSnapshot.trigger || "auto")}
                </span>
              </div>
              {!compareData && (
                <button className="vhp-modal__compare-btn" onClick={handleCompare} title="Compare with current">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  <div className="vhp-compare__pane">
                    <div className="vhp-compare__label">Selected Version</div>
                    {renderPreviewCanvas(previewData, 440, 500)}
                  </div>
                  <div className="vhp-compare__divider" />
                  <div className="vhp-compare__pane">
                    <div className="vhp-compare__label">Current State</div>
                    {renderPreviewCanvas(compareData, 440, 500)}
                  </div>
                </div>
              ) : (
                renderPreviewCanvas(previewData)
              )}
            </div>

            {/* Zoom controls bar */}
            {!loadingPreview && previewData && !compareData && (
              <div className="vhp-zoom-bar">
                <div className="vhp-zoom-bar__nav">
                  <button className="vhp-zoom-bar__btn" title="Previous version (←)" disabled={!hasPrev} onClick={() => navigatePreview(-1)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <span className="vhp-zoom-bar__pos">{previewIdx + 1} / {filteredSnapshots.length}</span>
                  <button className="vhp-zoom-bar__btn" title="Next version (→)" disabled={!hasNext} onClick={() => navigatePreview(1)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
                <div className="vhp-zoom-bar__controls">
                  <button className="vhp-zoom-bar__btn" title="Zoom out (Ctrl+-)" onClick={zoomOut} disabled={zoom <= ZOOM_MIN}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                  </button>
                  <span className="vhp-zoom-bar__level">{Math.round(zoom * 100)}%</span>
                  <button className="vhp-zoom-bar__btn" title="Zoom in (Ctrl+=)" onClick={zoomIn} disabled={zoom >= ZOOM_MAX}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                  </button>
                  <button className="vhp-zoom-bar__btn vhp-zoom-bar__btn--fit" title="Fit to screen (Ctrl+0)" onClick={fitToScreen}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="vhp-modal__footer">
              <button className="vhp-modal__btn vhp-modal__btn--secondary" onClick={handleClosePreview}>Close</button>
              <button className="vhp-modal__btn vhp-modal__btn--primary" onClick={handleRestoreClick} disabled={restoring || loadingPreview}>
                {restoring ? "Restoring…" : "Restore This Version"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
