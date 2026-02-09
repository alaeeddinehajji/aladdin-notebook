import { useCallback, useEffect, useRef, useState } from "react";

import {
  listFolders,
  listDrawings,
  createFolder,
  deleteFolder,
  renameFolder,
  deleteDrawing,
  renameDrawing,
  moveDrawing,
  resolveFolderPath,
} from "../data/drawingStorage";
import { getCurrentUser, logout } from "../data/authService";

import type { DrawingDocument, FolderDocument } from "../data/drawingStorage";
import type { User } from "../data/authService";

import "../global.scss";
import "./NotesDashboard.scss";

// Icons
const FolderIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const FileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);
const PenIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" />
  </svg>
);
const DotsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
  </svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const MoveIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
  </svg>
);
const ChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "0.75rem", height: "0.75rem" }}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const LogOutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);
const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "0.875rem", height: "0.875rem" }}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const GridIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
);
const ListIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

type ViewMode = "grid" | "list";
type CardSize = "small" | "medium" | "large";

const getStoredViewPrefs = (): { viewMode: ViewMode; cardSize: CardSize } => {
  try {
    const stored = localStorage.getItem("aladdin-view-prefs");
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        viewMode: parsed.viewMode || "grid",
        cardSize: parsed.cardSize || "medium",
      };
    }
  } catch { /* ignore */ }
  return { viewMode: "grid", cardSize: "medium" };
};

const storeViewPrefs = (viewMode: ViewMode, cardSize: CardSize) => {
  try {
    localStorage.setItem("aladdin-view-prefs", JSON.stringify({ viewMode, cardSize }));
  } catch { /* ignore */ }
};

// Context Menu
type ContextMenuProps = {
  x: number; y: number;
  items: { label: string; icon?: React.ReactNode; danger?: boolean; onClick: () => void }[];
  onClose: () => void;
};
const ContextMenu = ({ x, y, items, onClose }: ContextMenuProps) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { onClose(); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div ref={ref} className="nd-context-menu" style={{ left: x, top: y }}>
      {items.map((item, i) => (
        <button key={i} className={`nd-context-menu__item ${item.danger ? "nd-context-menu__item--danger" : ""}`}
          onClick={() => { item.onClick(); onClose(); }}>
          {item.icon}{item.label}
        </button>
      ))}
    </div>
  );
};

// Modal
type ModalProps = {
  title: string; defaultValue?: string; placeholder?: string; confirmLabel?: string;
  onConfirm: (value: string) => void; onCancel: () => void;
};
const Modal = ({ title, defaultValue = "", placeholder, confirmLabel = "Create", onConfirm, onCancel }: ModalProps) => {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  return (
    <div className="nd-modal">
      <div className="nd-modal__backdrop" onClick={onCancel} />
      <div className="nd-modal__content">
        <div className="nd-modal__title">{title}</div>
        <input ref={inputRef} className="nd-modal__input" value={value} placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) { onConfirm(value.trim()); } if (e.key === "Escape") { onCancel(); } }} />
        <div className="nd-modal__actions">
          <button className="an-btn an-btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="an-btn an-btn--primary" onClick={() => value.trim() && onConfirm(value.trim())} disabled={!value.trim()}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

// Move Modal
type MoveModalProps = {
  drawingName: string;
  folders: FolderDocument[];
  currentFolderId: string;
  onMove: (folderId: string) => void;
  onCancel: () => void;
};
const MoveModal = ({ drawingName, folders, currentFolderId, onMove, onCancel }: MoveModalProps) => {
  const [selected, setSelected] = useState(currentFolderId);
  return (
    <div className="nd-modal">
      <div className="nd-modal__backdrop" onClick={onCancel} />
      <div className="nd-modal__content">
        <div className="nd-modal__title">Move "{drawingName}"</div>
        <div className="nd-move-list">
          <button className={`nd-move-list__item ${selected === "" ? "nd-move-list__item--active" : ""}`}
            onClick={() => setSelected("")}>
            <FolderIcon /> Root (no folder)
          </button>
          {folders.map((f) => (
            <button key={f.$id}
              className={`nd-move-list__item ${selected === f.$id ? "nd-move-list__item--active" : ""}`}
              onClick={() => setSelected(f.$id)}>
              <FolderIcon /> {f.name}
            </button>
          ))}
        </div>
        <div className="nd-modal__actions">
          <button className="an-btn an-btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="an-btn an-btn--primary" onClick={() => onMove(selected)}>Move</button>
        </div>
      </div>
    </div>
  );
};

// Main
type NotesDashboardProps = {
  folderPath: string[];
  onNewDrawing: (folderId: string, folderPath: string[]) => void;
  onOpenDrawing: (drawing: DrawingDocument, folderPath: string[]) => void;
  onLogout: () => void;
  onNavigate: (path: string) => void;
};

const buildNotesUrl = (folderPath: string[]) => {
  if (folderPath.length === 0) {
    return "/notes";
  }
  return "/notes/" + folderPath.map(encodeURIComponent).join("/");
};

export const NotesDashboard = ({ folderPath, onNewDrawing, onOpenDrawing, onLogout, onNavigate }: NotesDashboardProps) => {
  const user = getCurrentUser() as User;
  const [folders, setFolders] = useState<FolderDocument[]>([]);
  const [drawings, setDrawings] = useState<DrawingDocument[]>([]);
  const [allFolders, setAllFolders] = useState<FolderDocument[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuProps | null>(null);
  const [modal, setModal] = useState<ModalProps | null>(null);
  const [moveModal, setMoveModal] = useState<{ drawing: DrawingDocument } | null>(null);

  // Resolve folder path from URL to folder ID, then load content
  // Single effect to avoid race condition (flash of root content)
  const loadContent = useCallback(async (folderId: string) => {
    setLoading(true);
    try {
      const [folderList, drawingList] = await Promise.all([
        listFolders(user.$id, folderId),
        listDrawings(user.$id, folderId),
      ]);
      setFolders(folderList);
      setDrawings(drawingList);
      // Also load all root folders for move dialog
      const rootFolders = await listFolders(user.$id, "");
      setAllFolders(rootFolders);
    } catch (err) {
      console.error("Failed to load content:", err);
    } finally {
      setLoading(false);
    }
  }, [user.$id]);

  useEffect(() => {
    let cancelled = false;
    const resolveAndLoad = async () => {
      setLoading(true);
      let folderId = "";

      if (folderPath.length > 0) {
        try {
          const resolved = await resolveFolderPath(user.$id, folderPath);
          if (cancelled) { return; }
          if (resolved) {
            folderId = resolved.folderId;
          } else {
            // Folder path not found — redirect to root
            onNavigate("/notes");
            return;
          }
        } catch {
          if (cancelled) { return; }
        }
      }

      setCurrentFolderId(folderId);
      if (!cancelled) {
        await loadContent(folderId);
      }
    };
    resolveAndLoad();
    return () => { cancelled = true; };
  }, [folderPath.join("/"), user.$id, loadContent]);

  const navigateToFolder = (folder: FolderDocument) => {
    const newPath = [...folderPath, folder.name];
    onNavigate(buildNotesUrl(newPath));
  };
  const navigateToBreadcrumb = (index: number) => {
    if (index < 0) {
      onNavigate("/notes");
    } else {
      const newPath = folderPath.slice(0, index + 1);
      onNavigate(buildNotesUrl(newPath));
    }
  };

  const handleCreateFolder = () => {
    setModal({
      title: "New Folder", placeholder: "Folder name", confirmLabel: "Create",
      onConfirm: async (name) => { setModal(null); await createFolder(user.$id, name, currentFolderId); await loadContent(currentFolderId); },
      onCancel: () => setModal(null),
    });
  };
  const handleRenameFolder = (folder: FolderDocument) => {
    setModal({
      title: "Rename Folder", defaultValue: folder.name, placeholder: "Folder name", confirmLabel: "Rename",
      onConfirm: async (name) => { setModal(null); await renameFolder(folder.$id, name); await loadContent(currentFolderId); },
      onCancel: () => setModal(null),
    });
  };
  const handleDeleteFolder = async (folder: FolderDocument) => {
    if (confirm(`Delete folder "${folder.name}" and all its contents?`)) {
      await deleteFolder(user.$id, folder.$id);
      loadContent(currentFolderId);
    }
  };
  const handleRenameDrawing = (drawing: DrawingDocument) => {
    setModal({
      title: "Rename Drawing", defaultValue: drawing.name, placeholder: "Drawing name", confirmLabel: "Rename",
      onConfirm: async (name) => { setModal(null); await renameDrawing(drawing.$id, name); loadContent(currentFolderId); },
      onCancel: () => setModal(null),
    });
  };
  const handleDeleteDrawing = async (drawing: DrawingDocument) => {
    if (confirm(`Delete drawing "${drawing.name}"?`)) {
      await deleteDrawing(drawing.$id, drawing.storageFileId);
      loadContent(currentFolderId);
    }
  };
  const handleMoveDrawing = async (drawingId: string, folderId: string) => {
    await moveDrawing(drawingId, folderId);
    setMoveModal(null);
    loadContent(currentFolderId);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) { return "Just now"; }
    if (mins < 60) { return `${mins}m ago`; }
    if (hrs < 24) { return `${hrs}h ago`; }
    if (days < 7) { return `${days}d ago`; }
    return date.toLocaleDateString();
  };

  const showFolderMenu = (e: React.MouseEvent, folder: FolderDocument) => {
    e.stopPropagation();
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: "Rename", icon: <EditIcon />, onClick: () => handleRenameFolder(folder) },
        { label: "Delete", icon: <TrashIcon />, danger: true, onClick: () => handleDeleteFolder(folder) },
      ],
      onClose: () => setContextMenu(null),
    });
  };
  const showDrawingMenu = (e: React.MouseEvent, drawing: DrawingDocument) => {
    e.stopPropagation();
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: "Rename", icon: <EditIcon />, onClick: () => handleRenameDrawing(drawing) },
        { label: "Move to...", icon: <MoveIcon />, onClick: () => setMoveModal({ drawing }) },
        { label: "Delete", icon: <TrashIcon />, danger: true, onClick: () => handleDeleteDrawing(drawing) },
      ],
      onClose: () => setContextMenu(null),
    });
  };

  const handleLogout = () => { logout(); onLogout(); };
  const isEmpty = !loading && folders.length === 0 && drawings.length === 0;
  const breadcrumb = folderPath;

  // View preferences
  const [viewMode, setViewMode] = useState<ViewMode>(() => getStoredViewPrefs().viewMode);
  const [cardSize, setCardSize] = useState<CardSize>(() => getStoredViewPrefs().cardSize);

  const updateViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    storeViewPrefs(mode, cardSize);
  };
  const updateCardSize = (size: CardSize) => {
    setCardSize(size);
    storeViewPrefs(viewMode, size);
  };

  // Size dropdown
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const sizeDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sizeDropdownRef.current && !sizeDropdownRef.current.contains(e.target as Node)) {
        setShowSizeDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="an-page nd">
      {/* Header */}
      <div className="nd__header">
        <div className="nd__header-left">
          <div className="nd__logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" />
            </svg>
          </div>
          <span className="nd__header-title">Aladdin Notes</span>
        </div>
        <div className="nd__header-right">
          <div className="nd__header-user">
            <div className="nd__avatar">{user.name.charAt(0).toUpperCase()}</div>
            <span className="nd__user-name">{user.name}</span>
          </div>
          <button className="an-btn an-btn--ghost nd__logout-btn" onClick={handleLogout} title="Log out">
            <LogOutIcon />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="nd__toolbar">
        <div className="nd__toolbar-left">
          <div className="nd__breadcrumb">
            <span className={`nd__breadcrumb-home ${breadcrumb.length === 0 ? "nd__breadcrumb-home--active" : ""}`}
              onClick={() => navigateToBreadcrumb(-1)} title="Home">
              <HomeIcon />
            </span>
            <span className={`nd__breadcrumb-item ${breadcrumb.length === 0 ? "nd__breadcrumb-item--active" : ""}`}
              onClick={() => navigateToBreadcrumb(-1)}>My Notes</span>
            {breadcrumb.map((name, i) => (
              <span key={`${name}-${i}`} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <span className="nd__breadcrumb-sep"><ChevronRight /></span>
                <span className={`nd__breadcrumb-item ${i === breadcrumb.length - 1 ? "nd__breadcrumb-item--active" : ""}`}
                  onClick={() => navigateToBreadcrumb(i)}>
                  {name}
                </span>
              </span>
            ))}
          </div>
        </div>
        <div className="nd__toolbar-right">
          {/* View controls */}
          <div className="nd__view-controls">
            <button
              className={`nd__view-btn ${viewMode === "grid" ? "nd__view-btn--active" : ""}`}
              onClick={() => updateViewMode("grid")}
              title="Grid view">
              <GridIcon />
            </button>
            <button
              className={`nd__view-btn ${viewMode === "list" ? "nd__view-btn--active" : ""}`}
              onClick={() => updateViewMode("list")}
              title="List view">
              <ListIcon />
            </button>
            {viewMode === "grid" && (
              <div className="nd__size-control" ref={sizeDropdownRef}>
                <button className="nd__view-btn" onClick={() => setShowSizeDropdown(!showSizeDropdown)} title="Card size">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="2" />
                    <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
                  </svg>
                </button>
                {showSizeDropdown && (
                  <div className="nd__size-dropdown">
                    {(["small", "medium", "large"] as CardSize[]).map((size) => (
                      <button key={size}
                        className={`nd__size-dropdown-item ${cardSize === size ? "nd__size-dropdown-item--active" : ""}`}
                        onClick={() => { updateCardSize(size); setShowSizeDropdown(false); }}>
                        {size.charAt(0).toUpperCase() + size.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="nd__toolbar-sep" />
          <button className="an-btn an-btn--ghost" onClick={handleCreateFolder}>
            <FolderIcon /> New Folder
          </button>
          <button className="an-btn an-btn--primary" onClick={() => onNewDrawing(currentFolderId, folderPath)}>
            <PlusIcon /> New Drawing
          </button>
        </div>
      </div>

      {/* Content — unified view: folders first, then drawings */}
      <div className={`nd__content nd__content--${viewMode} nd__content--${cardSize}`}>
        {loading ? (
          <div className="nd__spinner" />
        ) : isEmpty ? (
          <div className="nd__empty">
            <div className="nd__empty-icon"><PenIcon /></div>
            <div className="nd__empty-title">{breadcrumb.length > 0 ? "This folder is empty" : "No drawings yet"}</div>
            <div className="nd__empty-desc">Create a new drawing to get started, or add a folder to organize your work.</div>
            <button className="an-btn an-btn--primary" style={{ marginTop: "1.25rem" }} onClick={() => onNewDrawing(currentFolderId, folderPath)}>
              <PlusIcon /> Create Drawing
            </button>
          </div>
        ) : viewMode === "grid" ? (
          <div className={`nd__grid nd__grid--${cardSize}`}>
            {folders.map((folder) => (
              <div key={folder.$id} className="nd__folder-card" onClick={() => navigateToFolder(folder)}>
                <div className="nd__folder-card-icon" style={{ background: folder.color || "var(--primary)" }}>
                  <FolderIcon />
                </div>
                <div className="nd__folder-card-info">
                  <div className="nd__folder-card-name">{folder.name}</div>
                </div>
                <button className="nd__card-menu" onClick={(e) => showFolderMenu(e, folder)}><DotsIcon /></button>
              </div>
            ))}
            {drawings.map((drawing) => (
              <div key={drawing.$id} className="nd__drawing-card" onClick={() => onOpenDrawing(drawing, folderPath)}>
                <div className="nd__drawing-card-preview"><FileIcon /></div>
                <div className="nd__drawing-card-info">
                  <div className="nd__drawing-card-name">{drawing.name}</div>
                  <div className="nd__drawing-card-date">{formatDate(drawing.lastModified)}</div>
                </div>
                <button className="nd__card-menu nd__card-menu--abs" onClick={(e) => showDrawingMenu(e, drawing)}><DotsIcon /></button>
              </div>
            ))}
          </div>
        ) : (
          /* List view */
          <div className="nd__list">
            {folders.map((folder) => (
              <div key={folder.$id} className="nd__list-row" onClick={() => navigateToFolder(folder)}>
                <div className="nd__list-row-icon nd__list-row-icon--folder" style={{ color: folder.color || "var(--primary)" }}>
                  <FolderIcon />
                </div>
                <div className="nd__list-row-name">{folder.name}</div>
                <div className="nd__list-row-type">Folder</div>
                <div className="nd__list-row-date">{formatDate(folder.$updatedAt)}</div>
                <button className="nd__card-menu" onClick={(e) => showFolderMenu(e, folder)}><DotsIcon /></button>
              </div>
            ))}
            {drawings.map((drawing) => (
              <div key={drawing.$id} className="nd__list-row" onClick={() => onOpenDrawing(drawing, folderPath)}>
                <div className="nd__list-row-icon nd__list-row-icon--drawing">
                  <FileIcon />
                </div>
                <div className="nd__list-row-name">{drawing.name}</div>
                <div className="nd__list-row-type">Drawing</div>
                <div className="nd__list-row-date">{formatDate(drawing.lastModified)}</div>
                <button className="nd__card-menu" onClick={(e) => showDrawingMenu(e, drawing)}><DotsIcon /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {contextMenu && <ContextMenu {...contextMenu} />}
      {modal && <Modal {...modal} />}
      {moveModal && (
        <MoveModal
          drawingName={moveModal.drawing.name}
          folders={allFolders}
          currentFolderId={moveModal.drawing.folderId}
          onMove={(fid) => handleMoveDrawing(moveModal.drawing.$id, fid)}
          onCancel={() => setMoveModal(null)}
        />
      )}
    </div>
  );
};
