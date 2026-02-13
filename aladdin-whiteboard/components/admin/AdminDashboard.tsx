import { useEffect, useState } from "react";
import {
  getDashboardStats,
  getRecentErrors,
  getRecentActivity,
} from "../../data/adminService";
import type {
  DashboardStats,
  AdminErrorLog,
  AdminActivityLog,
} from "../../data/adminService";
import "./admin.scss";

export const AdminDashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentErrors, setRecentErrors] = useState<AdminErrorLog[]>([]);
  const [recentActivity, setRecentActivity] = useState<AdminActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [s, e, a] = await Promise.all([
        getDashboardStats(),
        getRecentErrors(5),
        getRecentActivity(10),
      ]);
      setStats(s);
      setRecentErrors(e);
      setRecentActivity(a);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="admin-loading__spinner" />
        Loading dashboard...
      </div>
    );
  }

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div>
      {/* Stats cards */}
      <div className="admin-stats">
        <div className="admin-stat-card admin-stat-card--accent">
          <div className="admin-stat-card__label">Total Users</div>
          <div className="admin-stat-card__value">{stats?.totalUsers ?? 0}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__label">Total Drawings</div>
          <div className="admin-stat-card__value">
            {stats?.totalDrawings ?? 0}
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__label">Total Folders</div>
          <div className="admin-stat-card__value">
            {stats?.totalFolders ?? 0}
          </div>
        </div>
        <div className="admin-stat-card admin-stat-card--error">
          <div className="admin-stat-card__label">Errors (24h)</div>
          <div className="admin-stat-card__value">
            {stats?.errorsLast24h ?? 0}
          </div>
        </div>
        <div className="admin-stat-card admin-stat-card--accent">
          <div className="admin-stat-card__label">Activity (24h)</div>
          <div className="admin-stat-card__value">
            {stats?.activitiesLast24h ?? 0}
          </div>
        </div>
      </div>

      {/* Recent Errors */}
      <div className="admin-table-wrap">
        <div className="admin-table-header">
          <div className="admin-table-header__title">Recent Errors</div>
        </div>
        {recentErrors.length === 0 ? (
          <div style={{ padding: "1.5rem", textAlign: "center", color: "#6b7280", fontSize: "0.875rem" }}>
            No errors recorded yet
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Level</th>
                <th>Source</th>
                <th>Message</th>
                <th>Browser</th>
              </tr>
            </thead>
            <tbody>
              {recentErrors.map((e) => (
                <tr key={e.$id}>
                  <td>{fmtTime(e.timestamp)}</td>
                  <td>
                    <span className={`admin-badge admin-badge--${e.level}`}>
                      {e.level}
                    </span>
                  </td>
                  <td>{e.source}</td>
                  <td title={e.message}>{e.message.slice(0, 80)}</td>
                  <td>{e.browser}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Activity */}
      <div className="admin-table-wrap">
        <div className="admin-table-header">
          <div className="admin-table-header__title">Recent Activity</div>
        </div>
        {recentActivity.length === 0 ? (
          <div style={{ padding: "1.5rem", textAlign: "center", color: "#6b7280", fontSize: "0.875rem" }}>
            No activity recorded yet
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
                <th>Response Time</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((a) => (
                <tr key={a.$id}>
                  <td>{fmtTime(a.timestamp)}</td>
                  <td>{a.userId.slice(0, 8)}...</td>
                  <td>{a.action}</td>
                  <td>{a.resourceType}{a.resourceId ? `: ${a.resourceId.slice(0, 8)}...` : ""}</td>
                  <td>
                    <span
                      className={`admin-badge admin-badge--${a.success ? "success" : "failure"}`}
                    >
                      {a.success ? "OK" : "FAIL"}
                    </span>
                  </td>
                  <td>{a.responseTime}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
