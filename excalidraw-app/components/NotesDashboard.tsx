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
  onNewDrawing: (folderId: string) => void;
  onOpenDrawing: (drawing: DrawingDocument) => void;
  onLogout: () => void;
};

type BreadcrumbItem = { id: string; name: string };

export const NotesDashboard = ({ onNewDrawing, onOpenDrawing, onLogout }: NotesDashboardProps) => {
  const user = getCurrentUser() as User;
  const [folders, setFolders] = useState<FolderDocument[]>([]);
  const [drawings, setDrawings] = useState<DrawingDocument[]>([]);
  const [allFolders, setAllFolders] = useState<FolderDocument[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState("");
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuProps | null>(null);
  const [modal, setModal] = useState<ModalProps | null>(null);
  const [moveModal, setMoveModal] = useState<{ drawing: DrawingDocument } | null>(null);

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

  useEffect(() => { loadContent(currentFolderId); }, [currentFolderId, loadContent]);

  const navigateToFolder = (folder: FolderDocument) => {
    setBreadcrumb((prev) => [...prev, { id: folder.$id, name: folder.name }]);
    setCurrentFolderId(folder.$id);
  };
  const navigateToBreadcrumb = (index: number) => {
    if (index < 0) { setBreadcrumb([]); setCurrentFolderId(""); }
    else { const item = breadcrumb[index]; setBreadcrumb((prev) => prev.slice(0, index + 1)); setCurrentFolderId(item.id); }
  };

  const handleCreateFolder = () => {
    setModal({
      title: "New Folder", placeholder: "Folder name", confirmLabel: "Create",
      onConfirm: async (name) => { setModal(null); await createFolder(user.$id, name, currentFolderId); loadContent(currentFolderId); },
      onCancel: () => setModal(null),
    });
  };
  const handleRenameFolder = (folder: FolderDocument) => {
    setModal({
      title: "Rename Folder", defaultValue: folder.name, placeholder: "Folder name", confirmLabel: "Rename",
      onConfirm: async (name) => { setModal(null); await renameFolder(folder.$id, name); loadContent(currentFolderId); },
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
          {breadcrumb.length > 0 ? (
            <div className="nd__breadcrumb">
              <span className="nd__breadcrumb-item" onClick={() => navigateToBreadcrumb(-1)}>My Notes</span>
              {breadcrumb.map((item, i) => (
                <span key={item.id} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <span className="nd__breadcrumb-sep"><ChevronRight /></span>
                  <span className={`nd__breadcrumb-item ${i === breadcrumb.length - 1 ? "nd__breadcrumb-item--active" : ""}`}
                    onClick={() => i < breadcrumb.length - 1 && navigateToBreadcrumb(i)}>
                    {item.name}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <h2 className="nd__page-title">My Notes</h2>
          )}
        </div>
        <div className="nd__toolbar-right">
          <button className="an-btn an-btn--ghost" onClick={handleCreateFolder}>
            <FolderIcon /> New Folder
          </button>
          <button className="an-btn an-btn--primary" onClick={() => onNewDrawing(currentFolderId)}>
            <PlusIcon /> New Drawing
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="nd__content">
        {loading ? (
          <div className="nd__spinner" />
        ) : isEmpty ? (
          <div className="nd__empty">
            <div className="nd__empty-icon"><PenIcon /></div>
            <div className="nd__empty-title">{breadcrumb.length > 0 ? "This folder is empty" : "No drawings yet"}</div>
            <div className="nd__empty-desc">Create a new drawing to get started, or add a folder to organize your work.</div>
            <button className="an-btn an-btn--primary" style={{ marginTop: "1.25rem" }} onClick={() => onNewDrawing(currentFolderId)}>
              <PlusIcon /> Create Drawing
            </button>
          </div>
        ) : (
          <>
            {folders.length > 0 && (
              <div className="nd__section">
                <div className="nd__section-title">Folders</div>
                <div className="nd__grid">
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
                </div>
              </div>
            )}
            {drawings.length > 0 && (
              <div className="nd__section">
                <div className="nd__section-title">Drawings</div>
                <div className="nd__grid nd__grid--drawings">
                  {drawings.map((drawing) => (
                    <div key={drawing.$id} className="nd__drawing-card" onClick={() => onOpenDrawing(drawing)}>
                      <div className="nd__drawing-card-preview"><FileIcon /></div>
                      <div className="nd__drawing-card-info">
                        <div className="nd__drawing-card-name">{drawing.name}</div>
                        <div className="nd__drawing-card-date">{formatDate(drawing.lastModified)}</div>
                      </div>
                      <button className="nd__card-menu nd__card-menu--abs" onClick={(e) => showDrawingMenu(e, drawing)}><DotsIcon /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
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
