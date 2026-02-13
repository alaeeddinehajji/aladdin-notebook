import { useEffect, useState, useCallback, useMemo } from "react";
import {
  listAllDrawings,
  listAllFolders,
  listAllUsers,
} from "../../data/adminService";
import type {
  AdminDrawing,
  AdminFolder,
  AdminUser,
} from "../../data/adminService";
import "./admin.scss";

type SortKey = "name" | "owner" | "lastModified" | "folderId" | "id" | "color" | "parentId" | "created";
type SortDir = "asc" | "desc";

export const AdminDrawings = () => {
  const [drawings, setDrawings] = useState<AdminDrawing[]>([]);
  const [folders, setFolders] = useState<AdminFolder[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [totalDrawings, setTotalDrawings] = useState(0);
  const [totalFolders, setTotalFolders] = useState(0);
  const [page, setPage] = useState(0);
  const [filterUserId, setFilterUserId] = useState("");
  const [tab, setTab] = useState<"drawings" | "folders">("drawings");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("lastModified");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const PAGE_SIZE = 25;

  const loadUsers = useCallback(async () => {
    try {
      const res = await listAllUsers(100);
      setUsers(res.users);
    } catch {
      // ignore
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "drawings") {
        const res = await listAllDrawings(
          PAGE_SIZE,
          page * PAGE_SIZE,
          filterUserId || undefined,
        );
        setDrawings(res.drawings);
        setTotalDrawings(res.total);
      } else {
        const res = await listAllFolders(
          PAGE_SIZE,
          page * PAGE_SIZE,
          filterUserId || undefined,
        );
        setFolders(res.folders);
        setTotalFolders(res.total);
      }
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }, [tab, page, filterUserId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setPage(0);
    setSelectedId(null);
  }, [tab, filterUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const userMap = useMemo(() => {
    const m = new Map<string, AdminUser>();
    users.forEach((u) => m.set(u.$id, u));
    return m;
  }, [users]);

  const getUserDisplay = (userId: string | null | undefined) => {
    if (!userId) return { name: "—", email: "" };
    const u = userMap.get(userId);
    return u
      ? { name: u.name, email: u.email }
      : { name: userId.slice(0, 8) + "...", email: "" };
  };

  const fmtTime = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  const sortedDrawings = useMemo(() => {
    const arr = [...drawings];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let va = "";
      let vb = "";
      switch (sortKey) {
        case "name":
          va = (a.name || "").toLowerCase();
          vb = (b.name || "").toLowerCase();
          break;
        case "owner":
          va = getUserDisplay(a.userId).name.toLowerCase();
          vb = getUserDisplay(b.userId).name.toLowerCase();
          break;
        case "lastModified":
          va = a.lastModified || "";
          vb = b.lastModified || "";
          break;
        case "folderId":
          va = a.folderId || "";
          vb = b.folderId || "";
          break;
        case "id":
          va = a.$id;
          vb = b.$id;
          break;
        default:
          return 0;
      }
      return va < vb ? -dir : va > vb ? dir : 0;
    });
    return arr;
  }, [drawings, sortKey, sortDir, userMap]);

  const sortedFolders = useMemo(() => {
    const arr = [...folders];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let va = "";
      let vb = "";
      switch (sortKey) {
        case "name":
          va = (a.name || "").toLowerCase();
          vb = (b.name || "").toLowerCase();
          break;
        case "owner":
          va = getUserDisplay(a.userId).name.toLowerCase();
          vb = getUserDisplay(b.userId).name.toLowerCase();
          break;
        case "color":
          va = a.color || "";
          vb = b.color || "";
          break;
        case "parentId":
          va = a.parentId || "";
          vb = b.parentId || "";
          break;
        case "created":
          va = a.$createdAt || "";
          vb = b.$createdAt || "";
          break;
        case "id":
          va = a.$id;
          vb = b.$id;
          break;
        default:
          return 0;
      }
      return va < vb ? -dir : va > vb ? dir : 0;
    });
    return arr;
  }, [folders, sortKey, sortDir, userMap]);

  const selectedDrawing = selectedId
    ? drawings.find((d) => d.$id === selectedId)
    : null;
  const selectedFolder = selectedId
    ? folders.find((f) => f.$id === selectedId)
    : null;

  const total = tab === "drawings" ? totalDrawings : totalFolders;

  return (
    <div>
      {/* Filters */}
      <div className="admin-filters">
        <div style={{ display: "flex", gap: "2px" }}>
          <button
            className={`admin-btn admin-btn--sm ${tab === "drawings" ? "admin-btn--primary" : ""}`}
            onClick={() => setTab("drawings")}
          >
            Drawings ({totalDrawings})
          </button>
          <button
            className={`admin-btn admin-btn--sm ${tab === "folders" ? "admin-btn--primary" : ""}`}
            onClick={() => setTab("folders")}
          >
            Folders ({totalFolders})
          </button>
        </div>
        <select
          className="admin-filter-select"
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value)}
        >
          <option value="">All Users</option>
          {users.map((u) => (
            <option key={u.$id} value={u.$id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
        <button
          className="admin-btn admin-btn--sm"
          onClick={() => loadData()}
        >
          Refresh
        </button>
      </div>

      {/* Detail panel */}
      {selectedDrawing && tab === "drawings" && (
        <div className="admin-detail" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <strong>Drawing Details</strong>
            <button className="admin-btn admin-btn--sm" onClick={() => setSelectedId(null)}>Close</button>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Name</div>
            <div className="admin-detail__value">{selectedDrawing.name}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">ID</div>
            <div className="admin-detail__value" style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{selectedDrawing.$id}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Owner</div>
            <div className="admin-detail__value">
              {getUserDisplay(selectedDrawing.userId).name}
              {getUserDisplay(selectedDrawing.userId).email && (
                <span style={{ color: "#6b7280", marginLeft: 6 }}>
                  ({getUserDisplay(selectedDrawing.userId).email})
                </span>
              )}
            </div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Folder ID</div>
            <div className="admin-detail__value">{selectedDrawing.folderId || "— (root)"}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Last Modified</div>
            <div className="admin-detail__value">{fmtTime(selectedDrawing.lastModified)}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Created</div>
            <div className="admin-detail__value">{fmtTime(selectedDrawing.$createdAt)}</div>
          </div>
          {selectedDrawing.thumbnail && (
            <div className="admin-detail__row">
              <div className="admin-detail__label">Thumbnail</div>
              <div className="admin-detail__value">
                <img
                  src={selectedDrawing.thumbnail}
                  alt="thumbnail"
                  style={{ maxWidth: 200, maxHeight: 120, borderRadius: 6, border: "1px solid #e4e4e7" }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {selectedFolder && tab === "folders" && (
        <div className="admin-detail" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <strong>Folder Details</strong>
            <button className="admin-btn admin-btn--sm" onClick={() => setSelectedId(null)}>Close</button>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Name</div>
            <div className="admin-detail__value">{selectedFolder.name}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">ID</div>
            <div className="admin-detail__value" style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{selectedFolder.$id}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Owner</div>
            <div className="admin-detail__value">
              {getUserDisplay(selectedFolder.userId).name}
              {getUserDisplay(selectedFolder.userId).email && (
                <span style={{ color: "#6b7280", marginLeft: 6 }}>
                  ({getUserDisplay(selectedFolder.userId).email})
                </span>
              )}
            </div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Color</div>
            <div className="admin-detail__value" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-block", width: 18, height: 18, borderRadius: 4, background: selectedFolder.color, border: "1px solid #e4e4e7" }} />
              {selectedFolder.color}
            </div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Parent ID</div>
            <div className="admin-detail__value">{selectedFolder.parentId || "— (root)"}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Created</div>
            <div className="admin-detail__value">{fmtTime(selectedFolder.$createdAt)}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="admin-loading">
          <div className="admin-loading__spinner" />
          Loading...
        </div>
      ) : tab === "drawings" ? (
        <div className="admin-table-wrap">
          {sortedDrawings.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280", fontSize: "0.875rem" }}>
              No drawings found
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="admin-table__sortable" onClick={() => handleSort("name")}>
                      Name{sortIcon("name")}
                    </th>
                    <th className="admin-table__sortable" onClick={() => handleSort("owner")}>
                      Owner{sortIcon("owner")}
                    </th>
                    <th>Email</th>
                    <th className="admin-table__sortable" onClick={() => handleSort("folderId")}>
                      Folder{sortIcon("folderId")}
                    </th>
                    <th className="admin-table__sortable" onClick={() => handleSort("lastModified")}>
                      Last Modified{sortIcon("lastModified")}
                    </th>
                    <th className="admin-table__sortable" onClick={() => handleSort("id")}>
                      ID{sortIcon("id")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDrawings.map((d) => {
                    const owner = getUserDisplay(d.userId);
                    return (
                      <tr
                        key={d.$id}
                        onClick={() => setSelectedId(d.$id === selectedId ? null : d.$id)}
                        className={d.$id === selectedId ? "admin-table__row--selected" : ""}
                        style={{ cursor: "pointer" }}
                      >
                        <td style={{ fontWeight: 500 }}>{d.name || "Untitled"}</td>
                        <td>
                          <span className="admin-badge admin-badge--user">{owner.name}</span>
                        </td>
                        <td style={{ color: "#6b7280", fontSize: "0.75rem" }}>{owner.email || "—"}</td>
                        <td>{d.folderId || "—"}</td>
                        <td>{fmtTime(d.lastModified)}</td>
                        <td style={{ fontSize: "0.7rem", color: "#9ca3af", fontFamily: "monospace" }}>
                          {d.$id.slice(0, 12)}...
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {total > PAGE_SIZE && (
            <div className="admin-pagination">
              <span>
                Showing {page * PAGE_SIZE + 1}–
                {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </span>
              <div className="admin-pagination__btns">
                <button
                  className="admin-btn admin-btn--sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  className="admin-btn admin-btn--sm"
                  disabled={(page + 1) * PAGE_SIZE >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="admin-table-wrap">
          {sortedFolders.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280", fontSize: "0.875rem" }}>
              No folders found
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="admin-table__sortable" onClick={() => handleSort("name")}>
                      Name{sortIcon("name")}
                    </th>
                    <th className="admin-table__sortable" onClick={() => handleSort("owner")}>
                      Owner{sortIcon("owner")}
                    </th>
                    <th>Email</th>
                    <th className="admin-table__sortable" onClick={() => handleSort("color")}>
                      Color{sortIcon("color")}
                    </th>
                    <th className="admin-table__sortable" onClick={() => handleSort("parentId")}>
                      Parent{sortIcon("parentId")}
                    </th>
                    <th className="admin-table__sortable" onClick={() => handleSort("created")}>
                      Created{sortIcon("created")}
                    </th>
                    <th className="admin-table__sortable" onClick={() => handleSort("id")}>
                      ID{sortIcon("id")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFolders.map((f) => {
                    const owner = getUserDisplay(f.userId);
                    return (
                      <tr
                        key={f.$id}
                        onClick={() => setSelectedId(f.$id === selectedId ? null : f.$id)}
                        className={f.$id === selectedId ? "admin-table__row--selected" : ""}
                        style={{ cursor: "pointer" }}
                      >
                        <td style={{ fontWeight: 500 }}>{f.name}</td>
                        <td>
                          <span className="admin-badge admin-badge--user">{owner.name}</span>
                        </td>
                        <td style={{ color: "#6b7280", fontSize: "0.75rem" }}>{owner.email || "—"}</td>
                        <td>
                          <span
                            style={{
                              display: "inline-block",
                              width: 14,
                              height: 14,
                              borderRadius: 3,
                              background: f.color,
                              verticalAlign: "middle",
                              marginRight: 6,
                              border: "1px solid #e4e4e7",
                            }}
                          />
                          {f.color}
                        </td>
                        <td>{f.parentId || "—"}</td>
                        <td>{fmtTime(f.$createdAt)}</td>
                        <td style={{ fontSize: "0.7rem", color: "#9ca3af", fontFamily: "monospace" }}>
                          {f.$id.slice(0, 12)}...
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {total > PAGE_SIZE && (
            <div className="admin-pagination">
              <span>
                Showing {page * PAGE_SIZE + 1}–
                {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </span>
              <div className="admin-pagination__btns">
                <button
                  className="admin-btn admin-btn--sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  className="admin-btn admin-btn--sm"
                  disabled={(page + 1) * PAGE_SIZE >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
