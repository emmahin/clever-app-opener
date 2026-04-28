/**
 * Centralized notification service.
 * - Persists to localStorage
 * - Emits toasts via sonner
 * - Handles scheduled reminders
 * - Pub/sub for UI components
 */
import { toast } from "sonner";

export type NotificationType =
  | "chat_response"
  | "whatsapp_message"
  | "news"
  | "stock_alert"
  | "reminder"
  | "ai_insight"
  | "system";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body?: string;
  source?: string; // ex: "WhatsApp", "Nex", "Marchés"
  actionUrl?: string;
  createdAt: number;
  read: boolean;
  scheduledFor?: number; // timestamp ms
  delivered: boolean; // false until shown (for scheduled)
  meta?: Record<string, unknown>;
}

export interface NotificationPrefs {
  enabled: boolean;
  doNotDisturb: boolean;
  quietHoursEnabled: boolean;
  quietStartHour: number; // 0-23
  quietEndHour: number; // 0-23
  byType: Record<NotificationType, boolean>;
  stockAlertThreshold: number; // percent
}

const LS_KEY = "app_notifications";
const LS_PREFS = "app_notification_prefs";
const MAX_STORED = 100;

const DEFAULT_PREFS: NotificationPrefs = {
  enabled: true,
  doNotDisturb: false,
  quietHoursEnabled: false,
  quietStartHour: 22,
  quietEndHour: 8,
  byType: {
    chat_response: true,
    whatsapp_message: true,
    news: true,
    stock_alert: true,
    reminder: true,
    ai_insight: true,
    system: true,
  },
  stockAlertThreshold: 3,
};

type Listener = (notifs: AppNotification[]) => void;

function loadAll(): AppNotification[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveAll(list: AppNotification[]) {
  try {
    const trimmed = list.slice(0, MAX_STORED);
    localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota */
  }
}

function loadPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(LS_PREFS);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFS;
    const byType = parsed && typeof parsed === "object" && parsed.byType && typeof parsed.byType === "object"
      ? parsed.byType
      : {};
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      byType: { ...DEFAULT_PREFS.byType, ...byType },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(p: NotificationPrefs) {
  try {
    localStorage.setItem(LS_PREFS, JSON.stringify(p));
  } catch {
    /* quota */
  }
}

function isInQuietHours(prefs: NotificationPrefs): boolean {
  if (prefs.doNotDisturb) return true;
  if (!prefs.quietHoursEnabled) return false;
  const h = new Date().getHours();
  const { quietStartHour: s, quietEndHour: e } = prefs;
  if (s === e) return false;
  if (s < e) return h >= s && h < e;
  // crosses midnight (e.g. 22 → 8)
  return h >= s || h < e;
}

function iconForType(type: NotificationType): string {
  switch (type) {
    case "chat_response": return "💬";
    case "whatsapp_message": return "📱";
    case "news": return "📰";
    case "stock_alert": return "📈";
    case "reminder": return "⏰";
    case "ai_insight": return "💡";
    case "system": return "⚙️";
  }
}

class NotificationService {
  private listeners = new Set<Listener>();
  private list: AppNotification[] = loadAll();
  private prefs: NotificationPrefs = loadPrefs();
  private schedulerId: number | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.startScheduler();
      // sync across tabs
      window.addEventListener("storage", (e) => {
        if (e.key === LS_KEY) {
          this.list = loadAll();
          this.emit();
        }
        if (e.key === LS_PREFS) {
          this.prefs = loadPrefs();
        }
      });
    }
  }

  private emit() {
    for (const l of this.listeners) l(this.list);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.list);
    return () => this.listeners.delete(l);
  }

  getAll(): AppNotification[] {
    return [...this.list];
  }

  getUnreadCount(): number {
    return this.list.filter((n) => !n.read && n.delivered).length;
  }

  getPrefs(): NotificationPrefs {
    return { ...this.prefs };
  }

  updatePrefs(p: Partial<NotificationPrefs>) {
    this.prefs = { ...this.prefs, ...p, byType: { ...this.prefs.byType, ...(p.byType || {}) } };
    savePrefs(this.prefs);
  }

  private showToast(n: AppNotification) {
    if (!this.prefs.enabled) return;
    if (!this.prefs.byType[n.type]) return;
    if (isInQuietHours(this.prefs)) return;
    const icon = iconForType(n.type);
    toast(`${icon}  ${n.title}`, {
      description: n.body,
      action: n.actionUrl
        ? { label: "Voir", onClick: () => { window.location.href = n.actionUrl!; } }
        : undefined,
    });
  }

  notify(input: Omit<AppNotification, "id" | "createdAt" | "read" | "delivered"> & { read?: boolean }): AppNotification {
    const now = Date.now();
    const scheduled = input.scheduledFor && input.scheduledFor > now;
    const n: AppNotification = {
      id: crypto.randomUUID(),
      createdAt: now,
      read: input.read ?? false,
      delivered: !scheduled,
      ...input,
    };
    this.list = [n, ...this.list].slice(0, MAX_STORED);
    saveAll(this.list);
    if (n.delivered) this.showToast(n);
    this.emit();
    return n;
  }

  /** Mark a previously-scheduled notification as now-delivered (called by scheduler). */
  private deliver(id: string) {
    const idx = this.list.findIndex((n) => n.id === id);
    if (idx === -1) return;
    const n = { ...this.list[idx], delivered: true };
    this.list[idx] = n;
    saveAll(this.list);
    this.showToast(n);
    this.emit();
  }

  markAsRead(id: string) {
    this.list = this.list.map((n) => (n.id === id ? { ...n, read: true } : n));
    saveAll(this.list);
    this.emit();
  }

  markAllAsRead() {
    this.list = this.list.map((n) => ({ ...n, read: true }));
    saveAll(this.list);
    this.emit();
  }

  dismiss(id: string) {
    this.list = this.list.filter((n) => n.id !== id);
    saveAll(this.list);
    this.emit();
  }

  clearAll() {
    this.list = [];
    saveAll(this.list);
    this.emit();
  }

  private startScheduler() {
    if (this.schedulerId !== null) return;
    const tick = () => {
      const now = Date.now();
      const due = this.list.filter((n) => !n.delivered && n.scheduledFor && n.scheduledFor <= now);
      for (const n of due) this.deliver(n.id);
    };
    tick();
    this.schedulerId = window.setInterval(tick, 5_000); // every 5s
  }
}

export const notificationService = new NotificationService();