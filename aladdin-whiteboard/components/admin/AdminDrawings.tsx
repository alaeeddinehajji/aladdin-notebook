import { useEffect, useState, useCallback } from "react";
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
  }, [tab, filterUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getUserName = (userId: string) => {
    const u = users.find((u) => u.$id === userId);
    return u ? u.name : userId.slice(0, 8) + "...";
  };

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

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
            Drawings
          </button>
          <button
            className={`admin-btn admin-btn--sm ${tab === "folders" ? "admin-btn--primary" : ""}`}
            onClick={() => setTab("folders")}
          >
            Folders
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
      </div>

      {loading ? (
        <div className="admin-loading">
          <div className="admin-loading__spinner" />
          Loading...
        </div>
      ) : tab === "drawings" ? (
        <div className="admin-table-wrap">
          <div className="admin-table-header">
            <div className="admin-table-header__title">
              Drawings ({totalDrawings})
            </div>
          </div>
          {drawings.length === 0 ? (
            <div style={{ padding: "1.5rem", textAlign: "center", color: "#6b7280", fontSize: "0.875rem" }}>
              No drawings found
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Owner</th>
                  <th>Folder ID</th>
                  <th>Last Modified</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {drawings.map((d) => (
                  <tr key={d.$id}>
                    <td>{d.name}</td>
                    <td>{getUserName(d.userId)}</td>
                    <td>{d.folderId || "—"}</td>
                    <td>{fmtTime(d.lastModified)}</td>
                    <td style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                      {d.$id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          <div className="admin-table-header">
            <div className="admin-table-header__title">
              Folders ({totalFolders})
            </div>
          </div>
          {folders.length === 0 ? (
            <div style={{ padding: "1.5rem", textAlign: "center", color: "#6b7280", fontSize: "0.875rem" }}>
              No folders found
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Owner</th>
                  <th>Color</th>
                  <th>Parent ID</th>
                  <th>Created</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {folders.map((f) => (
                  <tr key={f.$id}>
                    <td>{f.name}</td>
                    <td>{getUserName(f.userId)}</td>
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
                        }}
                      />
                      {f.color}
                    </td>
                    <td>{f.parentId || "—"}</td>
                    <td>{fmtTime(f.$createdAt)}</td>
                    <td style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                      {f.$id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
