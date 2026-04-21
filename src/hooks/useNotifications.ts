import { useEffect, useState } from "react";
import { notificationService, AppNotification, NotificationPrefs } from "@/services/notificationService";

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => notificationService.getAll());
  useEffect(() => notificationService.subscribe(setNotifications), []);
  const unreadCount = notifications.filter((n) => !n.read && n.delivered).length;
  return {
    notifications,
    unreadCount,
    notify: notificationService.notify.bind(notificationService),
    markAsRead: notificationService.markAsRead.bind(notificationService),
    markAllAsRead: notificationService.markAllAsRead.bind(notificationService),
    dismiss: notificationService.dismiss.bind(notificationService),
    clearAll: notificationService.clearAll.bind(notificationService),
  };
}

export function useNotificationPrefs() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => notificationService.getPrefs());
  const update = (p: Partial<NotificationPrefs>) => {
    notificationService.updatePrefs(p);
    setPrefs(notificationService.getPrefs());
  };
  return { prefs, update };
}