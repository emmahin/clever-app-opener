/**
 * Service n8n — déclenche un webhook n8n unique configuré par l'utilisateur.
 * L'appel se fait DEPUIS LE NAVIGATEUR (comme localAgentService) afin de
 * supporter les instances n8n locales (localhost) inaccessibles depuis Supabase.
 *
 * Stratégie "webhook générique" : une seule URL côté n8n, qui reçoit
 * { action, params } et route ensuite via un Switch n8n.
 * L'utilisateur déclare la liste des actions disponibles (nom + description)
 * pour que l'IA sache quoi appeler.
 */

const STORAGE_KEY = "nex.n8n.config.v1";

export interface N8nAction {
  /** Identifiant court envoyé à n8n dans `action` (ex: "add_expense"). */
  id: string;
  /** Description en langage naturel : aide l'IA à choisir quand l'utiliser. */
  description: string;
}

export interface N8nConfig {
  enabled: boolean;
  webhookUrl: string;
  /** Optionnel : envoyé dans le header `Authorization: Bearer <token>`. */
  token: string;
  actions: N8nAction[];
}

export interface N8nTriggerResult {
  ok: boolean;
  status?: number;
  data?: unknown;
  detail?: string;
}

export interface IN8nService {
  loadConfig(): N8nConfig;
  saveConfig(cfg: N8nConfig): void;
  isConfigured(): boolean;
  ping(): Promise<N8nTriggerResult>;
  trigger(action: string, params?: Record<string, unknown>): Promise<N8nTriggerResult>;
}

const DEFAULT_CONFIG: N8nConfig = {
  enabled: false,
  webhookUrl: "",
  token: "",
  actions: [],
};

function read(): N8nConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      actions: Array.isArray(parsed?.actions) ? parsed.actions : [],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function write(cfg: N8nConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* quota / private mode */
  }
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\s+/g, "");
}

async function call(
  url: string,
  token: string,
  body: unknown,
  timeoutMs = 8000,
): Promise<N8nTriggerResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    let data: unknown = null;
    const text = await resp.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!resp.ok) {
      return { ok: false, status: resp.status, data, detail: `HTTP ${resp.status}` };
    }
    return { ok: true, status: resp.status, data };
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    if (err?.name === "AbortError") {
      return { ok: false, detail: "n8n injoignable (timeout)." };
    }
    return { ok: false, detail: err?.message || "Erreur réseau." };
  } finally {
    clearTimeout(t);
  }
}

export const n8nService: IN8nService = {
  loadConfig() { return read(); },

  saveConfig(cfg) {
    write({
      enabled: !!cfg.enabled,
      webhookUrl: normalizeUrl(cfg.webhookUrl),
      token: cfg.token.trim(),
      actions: (cfg.actions || [])
        .map((a) => ({ id: a.id.trim(), description: a.description.trim() }))
        .filter((a) => a.id.length > 0),
    });
  },

  isConfigured() {
    const c = read();
    return c.enabled && !!c.webhookUrl;
  },

  async ping() {
    const c = read();
    if (!c.webhookUrl) return { ok: false, detail: "URL webhook manquante." };
    return call(c.webhookUrl, c.token, { action: "__ping__", params: {} }, 5000);
  },

  async trigger(action, params = {}) {
    const c = read();
    if (!c.enabled) return { ok: false, detail: "n8n désactivé dans les paramètres." };
    if (!c.webhookUrl) return { ok: false, detail: "URL webhook n8n non configurée." };
    return call(c.webhookUrl, c.token, { action, params });
  },
};
