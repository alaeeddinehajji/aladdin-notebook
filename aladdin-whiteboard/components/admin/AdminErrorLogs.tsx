import { useEffect, useState, useCallback, useRef } from "react";
import { listErrorLogs, getErrorLog } from "../../data/adminService";
import type { AdminErrorLog } from "../../data/adminService";
import "./admin.scss";

export const AdminErrorLogs = () => {
  const [logs, setLogs] = useState<AdminErrorLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [detail, setDetail] = useState<AdminErrorLog | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const PAGE_SIZE = 25;

  const loadData = useCallback(async () => {
    try {
      const filters: { level?: string; source?: string } = {};
      if (filterLevel) filters.level = filterLevel;
      if (filterSource) filters.source = filterSource;
      const res = await listErrorLogs(PAGE_SIZE, page * PAGE_SIZE, filters);
      setLogs(res.logs);
      setTotal(res.total);
    } catch (err) {
      console.error("Failed to load error logs:", err);
    } finally {
      setLoading(false);
    }
  }, [page, filterLevel, filterSource]);

  useEffect(() => {
    setPage(0);
  }, [filterLevel, filterSource]);

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
      const log = await getErrorLog(id);
      if (log) setDetail(log);
    } catch (err) {
      console.error("Failed to load error detail:", err);
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
        Loading error logs...
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
          ← Back to Error Logs
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
            <div className="admin-detail__label">Level</div>
            <div className="admin-detail__value">
              <span className={`admin-badge admin-badge--${detail.level}`}>
                {detail.level}
              </span>
            </div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Source</div>
            <div className="admin-detail__value">{detail.source}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">User ID</div>
            <div className="admin-detail__value">{detail.userId || "—"}</div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">URL</div>
            <div className="admin-detail__value">{detail.url}</div>
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
            <div className="admin-detail__label">User Agent</div>
            <div className="admin-detail__value" style={{ fontSize: "0.75rem" }}>
              {detail.userAgent}
            </div>
          </div>
          <div className="admin-detail__row">
            <div className="admin-detail__label">Message</div>
            <div className="admin-detail__pre">{detail.message}</div>
          </div>
          {detail.stack && (
            <div className="admin-detail__row">
              <div className="admin-detail__label">Stack Trace</div>
              <div className="admin-detail__pre">{detail.stack}</div>
            </div>
          )}
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
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value)}
        >
          <option value="">All Levels</option>
          <option value="error">Error</option>
          <option value="warn">Warning</option>
          <option value="info">Info</option>
        </select>
        <select
          className="admin-filter-select"
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
        >
          <option value="">All Sources</option>
          <option value="js_error">JS Error</option>
          <option value="unhandled_rejection">Unhandled Rejection</option>
          <option value="console">Console</option>
          <option value="network">Network</option>
        </select>
        <div className="admin-auto-refresh">
          <input
            type="checkbox"
            id="auto-refresh-errors"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          <label htmlFor="auto-refresh-errors">Auto-refresh (10s)</label>
        </div>
        <button className="admin-btn admin-btn--sm" onClick={loadData}>
          Refresh
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-table-header">
          <div className="admin-table-header__title">
            Error Logs ({total})
          </div>
        </div>
        {logs.length === 0 ? (
          <div style={{ padding: "1.5rem", textAlign: "center", color: "#6b7280", fontSize: "0.875rem" }}>
            No error logs found
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Level</th>
                <th>Source</th>
                <th>Message</th>
                <th>User</th>
                <th>Browser</th>
                <th>OS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.$id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtTime(log.timestamp)}</td>
                  <td>
                    <span className={`admin-badge admin-badge--${log.level}`}>
                      {log.level}
                    </span>
                  </td>
                  <td>{log.source}</td>
                  <td title={log.message}>{log.message.slice(0, 60)}</td>
                  <td>{log.userId ? log.userId.slice(0, 8) + "..." : "—"}</td>
                  <td>{log.browser}</td>
                  <td>{log.os}</td>
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
