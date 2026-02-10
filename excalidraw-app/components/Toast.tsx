import { useCallback, useEffect, useRef, useState } from "react";
import "./Toast.scss";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastData {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration?: number;
}

let toastIdCounter = 0;
const listeners: Set<(toast: ToastData) => void> = new Set();

export const toast = {
  _emit(data: Omit<ToastData, "id">) {
    const id = `toast-${++toastIdCounter}`;
    const full: ToastData = { id, duration: 4000, ...data };
    listeners.forEach((fn) => fn(full));
  },
  success(title: string, description?: string) {
    this._emit({ title, description, variant: "success" });
  },
  error(title: string, description?: string) {
    this._emit({ title, description, variant: "error", duration: 6000 });
  },
  warning(title: string, description?: string) {
    this._emit({ title, description, variant: "warning", duration: 5000 });
  },
  info(title: string, description?: string) {
    this._emit({ title, description, variant: "info" });
  },
};

const ICONS: Record<ToastVariant, React.ReactNode> = {
  success: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  error: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  warning: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

export const ToastContainer = () => {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, _exiting: true } as any : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const handler = (data: ToastData) => {
      setToasts((prev) => {
        const next = [...prev, data];
        if (next.length > 5) {
          return next.slice(-5);
        }
        return next;
      });
      if (data.duration && data.duration > 0) {
        const timer = setTimeout(() => removeToast(data.id), data.duration);
        timersRef.current.set(data.id, timer);
      }
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
      timersRef.current.forEach((t) => clearTimeout(t));
    };
  }, [removeToast]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="an-toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`an-toast an-toast--${t.variant}${(t as any)._exiting ? " an-toast--exit" : ""}`}
          role="alert"
        >
          <div className="an-toast__icon">{ICONS[t.variant]}</div>
          <div className="an-toast__content">
            <div className="an-toast__title">{t.title}</div>
            {t.description && (
              <div className="an-toast__desc">{t.description}</div>
            )}
          </div>
          <button
            className="an-toast__close"
            onClick={() => removeToast(t.id)}
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
};
