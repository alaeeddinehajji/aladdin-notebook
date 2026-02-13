import { useEffect, useState, useCallback, useRef } from "react";
import {
  listActivityLogs,
  getActivityLog,
  listAllUsers,
} from "../../data/adminService";
import type { AdminActivityLog, AdminUser } from "../../data/adminService";
import "./admin.scss";

export const AdminActivityLogs = () => {
  const [logs, setLogs] = useState<AdminActivityLog[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterUserId, setFilterUserId] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterSuccess, setFilterSuccess] = useState<"" | "true" | "false">("");
  const [detail, setDetail] = useState<AdminActivityLog | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    try {
      const filters: { userId?: string; action?: string; success?: boolean } = {};
      if (filterUserId) filters.userId = filterUserId;
      if (filterAction) filters.action = filterAction;
      if (filterSuccess === "true") filters.success = true;
      if (filterSuccess === "false") filters.success = false;
      const res = await listActivityLogs(PAGE_SIZE, page * PAGE_SIZE, filters);
      setLogs(res.logs);
      setTotal(res.total);
    } catch (err) {
      console.error("Failed to load activity logs:", err);
    } finally {
      setLoading(false);
    }
  }, [page, filterUserId, filterAction, filterSuccess]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setPage(0);
  }, [filterUserId, filterAction, filterSuccess]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        loadData();
      }, 10000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, loadData]);

  const handleViewDetail = async (id: string) => {
    try {
      const log = await getActivityLog(id);
      if (log) setDetail(log);
    } catch (err) {
      console.error("Failed to load activity detail:", err);
    }
  };

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

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="admin-loading__spinner" />
        Loading activity logs...
      </div>
    );
  }

  // Detail view
  if (detail) {
    let parsedMeta = "";
    try {
      if (detail.metadata) {
        parsedMeta = JSON.stringify(JSON.parse(detail.metadata), null, 2);
      }
    } catch {
      parsedMeta = detail.metadata;
    }

    return (
      <div>
        <button
          className="admin-btn"
          onClick={() => setDetail(null)}
          style={{ marginBottom: "1rem" }}
        >
          ← Back to Activity Logs
        </button>

        <div className="admin-detail">
          <div className="admin-detail__row">
            <div className="admin-detail__label">ID</div>
            <div className="admin-detail__value">{detail.$id}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Timestamp</div>
            <div className="admin-detail__value">{fmtTime(detail.timestamp)}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">User</div>
            <div className="admin-detail__value">
              {getUserName(detail.userId)} ({detail.userId})
            </div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Action</div>
            <div className="admin-detail__value">{detail.action}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Resource</div>
            <div className="admin-detail__value">
              {detail.resourceType}{detail.resourceId ? `: ${detail.resourceId}` : ""}
            </div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Method</div>
            <div className="admin-detail__value">{detail.method || "—"}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">URL</div>
            <div className="admin-detail__value">{detail.url}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Status</div>
            <div className="admin-detail__value">
              <span className={`admin-badge admin-badge--${detail.success ? "success" : "failure"}`}>
                {detail.success ? "Success" : "Failed"}
              </span>
              {" "}
              (HTTP {detail.statusCode})
            </div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Request Size</div>
            <div className="admin-detail__value">{detail.requestSize} bytes</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Response Size</div>
            <div className="admin-detail__value">{detail.responseSize} bytes</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Response Time</div>
            <div className="admin-detail__value">{detail.responseTime}ms</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Browser</div>
            <div className="admin-detail__value">{detail.browser}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">OS</div>
            <div className="admin-detail__value">{detail.os}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">IP</div>
            <div className="admin-detail__value">{detail.ip || "—"}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Location</div>
            <div className="admin-detail__value">{detail.location || "—"}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">User Agent</div>
            <div className="admin-detail__value" style={{ fontSize: "0.75rem" }}>
              {detail.userAgent}
            </div>
          </div>
          {parsedMeta && (
            <div className="admin-detail__row">
              <div className="admin-detail__label">Metadata</div>
              <div className="admin-detail__pre">{parsedMeta}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div>
      <div className="admin-filters">
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
        <select
          className="admin-filter-select"
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
        >
          <option value="">All Actions</option>
          <option value="login">Login</option>
          <option value="register">Register</option>
          <option value="logout">Logout</option>
          <option value="page_view">Page View</option>
          <option value="save_drawing">Save Drawing</option>
          <option value="load_drawing">Load Drawing</option>
          <option value="create_drawing">Create Drawing</option>
          <option value="delete_drawing">Delete Drawing</option>
          <option value="create_folder">Create Folder</option>
          <option value="delete_folder">Delete Folder</option>
          <option value="rename_drawing">Rename Drawing</option>
          <option value="rename_folder">Rename Folder</option>
          <option value="move_drawing">Move Drawing</option>
        </select>
        <select
          className="admin-filter-select"
          value={filterSuccess}
          onChange={(e) => setFilterSuccess(e.target.value as "" | "true" | "false")}
        >
          <option value="">All Status</option>
          <option value="true">Success</option>
          <option value="false">Failed</option>
        </select>
        <div className="admin-auto-refresh">
          <input
            type="checkbox"
            id="auto-refresh-activity"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          <label htmlFor="auto-refresh-activity">Auto-refresh (10s)</label>
        </div>
        <button className="admin-btn admin-btn--sm" onClick={loadData}>
          Refresh
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-table-header">
          <div className="admin-table-header__title">
            Activity Logs ({total})
          </div>
        </div>
        {logs.length === 0 ? (
          <div style={{ padding: "1.5rem", textAlign: "center", color: "#6b7280", fontSize: "0.875rem" }}>
            No activity logs found
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Status</th>
                <th>Time (ms)</th>
                <th>Browser</th>
                <th>IP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.$id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtTime(log.timestamp)}</td>
                  <td>{getUserName(log.userId)}</td>
                  <td>{log.action}</td>
                  <td>
                    {log.resourceType}
                    {log.resourceId ? `: ${log.resourceId.slice(0, 8)}...` : ""}
                  </td>
                  <td>
                    <span className={`admin-badge admin-badge--${log.success ? "success" : "failure"}`}>
                      {log.success ? "OK" : "FAIL"}
                    </span>
                  </td>
                  <td>{log.responseTime}</td>
                  <td>{log.browser}</td>
                  <td>{log.ip || "—"}</td>
                  <td>
                    <button
                      className="admin-btn admin-btn--sm admin-btn--primary"
                      onClick={() => handleViewDetail(log.$id)}
                    >
                      View
                    </button>
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
    </div>
  );
};
