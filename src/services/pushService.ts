import { supabase } from "@/integrations/supabase/client";

export const pushService = {
  isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
  },

  isStandalone(): boolean {
    if (typeof window === "undefined") return false;
    // iOS PWA
    // @ts-expect-error standalone exists on iOS Safari
    if (window.navigator.standalone) return true;
    return window.matchMedia("(display-mode: standalone)").matches;
  },

  isIOS(): boolean {
    if (typeof navigator === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  },

  permission(): NotificationPermission {
    if (typeof Notification === "undefined") return "denied";
    return Notification.permission;
  },

  async getRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (!("serviceWorker" in navigator)) return null;
    let reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) {
      reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
    await navigator.serviceWorker.ready;
    return reg;
  },

  async getCurrentSubscription(): Promise<PushSubscription | null> {
    const reg = await this.getRegistration();
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  },

  async fetchPublicKey(): Promise<string> {
    const { data, error } = await supabase.functions.invoke("vapid-public-key", {
      method: "GET",
    });
    if (error) throw error;
    return (data as { publicKey: string }).publicKey;
  },

  async subscribe(): Promise<PushSubscription> {
    if (!this.isSupported()) throw new Error("Push non supporté sur cet appareil");
    if (this.isIOS() && !this.isStandalone()) {
      throw new Error("Sur iPhone/iPad, ajoute d'abord l'app à ton écran d'accueil (partage → Sur l'écran d'accueil)");
    }

    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("Permission refusée");

    const reg = await this.getRegistration();
    if (!reg) throw new Error("Service worker indisponible");

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const publicKey = await this.fetchPublicKey();
      if (!publicKey) throw new Error("Clé serveur manquante");
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const { error } = await supabase.functions.invoke("push-subscribe", {
      body: { action: "subscribe", subscription: sub.toJSON() },
    });
    if (error) throw error;
    return sub;
  },

  async unsubscribe(): Promise<void> {
    const sub = await this.getCurrentSubscription();
    if (!sub) return;
    try {
      await supabase.functions.invoke("push-subscribe", {
        body: { action: "unsubscribe", subscription: sub.toJSON() },
      });
    } catch (e) {
      console.error(e);
    }
    await sub.unsubscribe();
  },
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}