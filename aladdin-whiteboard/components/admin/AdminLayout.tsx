import { getCurrentUser } from "../../data/authService";
import "./admin.scss";

type AdminPage = "dashboard" | "users" | "drawings" | "errors" | "activity";

const NAV_ITEMS: { key: AdminPage; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "📊" },
  { key: "users", label: "Users", icon: "👥" },
  { key: "drawings", label: "Drawings & Files", icon: "🎨" },
  { key: "errors", label: "Error Logs", icon: "🐛" },
  { key: "activity", label: "Activity Logs", icon: "📋" },
];

export const AdminLayout = ({
  activePage,
  title,
  onNavigate,
  onBackToApp,
  children,
}: {
  activePage: AdminPage;
  title: string;
  onNavigate: (page: AdminPage) => void;
  onBackToApp: () => void;
  children: React.ReactNode;
}) => {
  const user = getCurrentUser();

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__logo">
          <span>A</span> Admin Panel
        </div>
        <nav className="admin-sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`admin-sidebar__link ${
                activePage === item.key ? "admin-sidebar__link--active" : ""
              }`}
              onClick={() => onNavigate(item.key)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar__footer">
          <button className="admin-sidebar__back" onClick={onBackToApp}>
            ← Back to App
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar__title">{title}</div>
          <div className="admin-topbar__user">
            {user?.name} ({user?.role})
          </div>
        </header>
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
};
