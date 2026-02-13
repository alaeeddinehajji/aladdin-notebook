import { useState } from "react";
import { isAdmin } from "../../data/authService";
import { isAdminPinVerified } from "../../data/adminAuth";
import { AdminPinGate } from "./AdminPinGate";
import { AdminLayout } from "./AdminLayout";
import { AdminDashboard } from "./AdminDashboard";
import { AdminUsers } from "./AdminUsers";
import { AdminDrawings } from "./AdminDrawings";
import { AdminErrorLogs } from "./AdminErrorLogs";
import { AdminActivityLogs } from "./AdminActivityLogs";

type AdminPage = "dashboard" | "users" | "drawings" | "errors" | "activity";

const PAGE_TITLES: Record<AdminPage, string> = {
  dashboard: "Dashboard",
  users: "User Management",
  drawings: "Drawings & Files",
  errors: "Error Logs",
  activity: "Activity Logs",
};

export const AdminPanel = ({
  initialPage,
  onNavigate,
  onBackToApp,
}: {
  initialPage?: AdminPage;
  onNavigate: (path: string) => void;
  onBackToApp: () => void;
}) => {
  const [pinVerified, setPinVerified] = useState(isAdminPinVerified());
  const [activePage, setActivePage] = useState<AdminPage>(initialPage ?? "dashboard");

  // Not admin at all
  if (!isAdmin()) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          background: "#f7f7f8",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>Access Denied</div>
        <div style={{ color: "#6b7280" }}>
          You do not have permission to access the admin panel.
        </div>
        <button
          onClick={onBackToApp}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1.25rem",
            background: "#19789e",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Back to App
        </button>
      </div>
    );
  }

  // PIN gate
  if (!pinVerified) {
    return <AdminPinGate onVerified={() => setPinVerified(true)} />;
  }

  const handleNavigate = (page: AdminPage) => {
    setActivePage(page);
    const path = page === "dashboard" ? "/admin" : `/admin/${page}`;
    window.history.pushState({}, "", path);
  };

  const renderPage = () => {
    switch (activePage) {
      case "dashboard":
        return <AdminDashboard />;
      case "users":
        return <AdminUsers />;
      case "drawings":
        return <AdminDrawings />;
      case "errors":
        return <AdminErrorLogs />;
      case "activity":
        return <AdminActivityLogs />;
      default:
        return <AdminDashboard />;
    }
  };

  return (
    <AdminLayout
      activePage={activePage}
      title={PAGE_TITLES[activePage]}
      onNavigate={handleNavigate}
      onBackToApp={onBackToApp}
    >
      {renderPage()}
    </AdminLayout>
  );
};
