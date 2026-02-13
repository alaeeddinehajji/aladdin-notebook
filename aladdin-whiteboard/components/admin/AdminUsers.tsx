import { useEffect, useState, useCallback } from "react";
import {
  listAllUsers,
  listAllDrawings,
  listAllFolders,
  updateUserRole,
  deleteUser,
  listActivityLogs,
} from "../../data/adminService";
import type {
  AdminUser,
  AdminDrawing,
  AdminFolder,
  AdminActivityLog,
} from "../../data/adminService";
import "./admin.scss";

type DetailView = {
  user: AdminUser;
  drawings: AdminDrawing[];
  folders: AdminFolder[];
  activity: AdminActivityLog[];
};

export const AdminUsers = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<DetailView | null>(null);
  const PAGE_SIZE = 25;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAllUsers(PAGE_SIZE, page * PAGE_SIZE);
      setUsers(res.users);
      setTotal(res.total);
    } catch (err) {
      console.error("Failed to load users:", err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleViewUser = async (user: AdminUser) => {
    try {
      const [drawings, folders, activity] = await Promise.all([
        listAllDrawings(50, 0, user.$id),
        listAllFolders(50, 0, user.$id),
        listActivityLogs(20, 0, { userId: user.$id }),
      ]);
      setDetail({
        user,
        drawings: drawings.drawings,
        folders: folders.folders,
        activity: activity.logs,
      });
    } catch (err) {
      console.error("Failed to load user detail:", err);
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await updateUserRole(userId, newRole);
      await loadUsers();
      if (detail && detail.user.$id === userId) {
        setDetail({ ...detail, user: { ...detail.user, role: newRole } });
      }
    } catch (err) {
      console.error("Failed to update role:", err);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Are you sure you want to delete this user? This cannot be undone.")) {
      return;
    }
    try {
      await deleteUser(userId);
      if (detail?.user.$id === userId) {
        setDetail(null);
      }
      await loadUsers();
    } catch (err) {
      console.error("Failed to delete user:", err);
    }
  };

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="admin-loading__spinner" />
        Loading users...
      </div>
    );
  }

  // Detail view
  if (detail) {
    return (
      <div>
        <button
          className="admin-btn"
          onClick={() => setDetail(null)}
          style={{ marginBottom: "1rem" }}
        >
          ← Back to Users
        </button>

        <div className="admin-detail">
          <div className="admin-detail__row">
            <div className="admin-detail__label">ID</div>
            <div className="admin-detail__value">{detail.user.$id}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Name</div>
            <div className="admin-detail__value">{detail.user.name}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Email</div>
            <div className="admin-detail__value">{detail.user.email}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Role</div>
            <div className="admin-detail__value">
              <select
                className="admin-filter-select"
                value={detail.user.role}
                onChange={(e) => handleChangeRole(detail.user.$id, e.target.value)}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
            </div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Created</div>
            <div className="admin-detail__value">
              {fmtTime(detail.user.$createdAt)}
            </div>
          </div>
        </div>

        {/* User's drawings */}
        <div className="admin-table-wrap">
          <div className="admin-table-header">
            <div className="admin-table-header__title">
              Drawings ({detail.drawings.length})
            </div>
          </div>
          {detail.drawings.length === 0 ? (
            <div style={{ padding: "1rem", textAlign: "center", color: "#6b7280", fontSize: "0.875rem" }}>
              No drawings
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Last Modified</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {detail.drawings.map((d) => (
                  <tr key={d.$id}>
                    <td>{d.name}</td>
                    <td>{fmtTime(d.lastModified)}</td>
                    <td>{d.$id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* User's folders */}
        <div className="admin-table-wrap">
          <div className="admin-table-header">
            <div className="admin-table-header__title">
              Folders ({detail.folders.length})
            </div>
          </div>
          {detail.folders.length === 0 ? (
            <div style={{ padding: "1rem", textAlign: "center", color: "#6b7280", fontSize: "0.875rem" }}>
              No folders
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Color</th>
                  <th>Created</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {detail.folders.map((f) => (
                  <tr key={f.$id}>
                    <td>{f.name}</td>
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
                    <td>{fmtTime(f.$createdAt)}</td>
                    <td>{f.$id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* User's recent activity */}
        <div className="admin-table-wrap">
          <div className="admin-table-header">
            <div className="admin-table-header__title">
              Recent Activity ({detail.activity.length})
            </div>
          </div>
          {detail.activity.length === 0 ? (
            <div style={{ padding: "1rem", textAlign: "center", color: "#6b7280", fontSize: "0.875rem" }}>
              No activity
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Browser</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {detail.activity.map((a) => (
                  <tr key={a.$id}>
                    <td>{fmtTime(a.timestamp)}</td>
                    <td>{a.action}</td>
                    <td>
                      <span className={`admin-badge admin-badge--${a.success ? "success" : "failure"}`}>
                        {a.success ? "OK" : "FAIL"}
                      </span>
                    </td>
                    <td>{a.browser}</td>
                    <td>{a.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // Users list
  return (
    <div>
      <div className="admin-table-wrap">
        <div className="admin-table-header">
          <div className="admin-table-header__title">
            All Users ({total})
          </div>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.$id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <span className={`admin-badge admin-badge--${u.role || "user"}`}>
                    {u.role || "user"}
                  </span>
                </td>
                <td>{fmtTime(u.$createdAt)}</td>
                <td>
                  <div style={{ display: "flex", gap: "0.375rem" }}>
                    <button
                      className="admin-btn admin-btn--sm admin-btn--primary"
                      onClick={() => handleViewUser(u)}
                    >
                      View
                    </button>
                    <button
                      className="admin-btn admin-btn--sm admin-btn--danger"
                      onClick={() => handleDeleteUser(u.$id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    </div>
  );
};
