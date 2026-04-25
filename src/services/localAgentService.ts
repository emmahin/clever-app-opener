/**
 * Service de communication avec l'agent local Nex (FastAPI tournant sur ton PC).
 * Suit la règle stricte du service layer : SEULE entrée pour appeler l'agent.
 *
 * URL + token sont lus depuis localStorage (configurés dans Settings).
 * Aucune dépendance Supabase ici : l'agent est purement côté navigateur ↔ PC.
 */

const STORAGE_KEY = "nex.localAgent.config.v1";
const APPS_CACHE_KEY = "nex.localAgent.apps.v1";

export interface LocalAgentConfig {
  url: string;     // ex: http://127.0.0.1:17345
  token: string;   // Bearer token partagé avec agent.py
  enabled: boolean;
}

export interface LocalAgentPing {
  ok: boolean;
  agent?: string;
  version?: string;
  platform?: string;
  allowlist_active?: boolean;
}

export interface LaunchResult {
  ok: boolean;
  method?: string;
  target?: string;
  detail?: string;
}

export interface DetectedApp {
  name: string;
  path: string;
  source: string; // "lnk" | "exe" | "app" | "desktop" | ...
}

export interface ListAppsResult {
  ok: boolean;
  platform: string;
  count: number;
  apps: DetectedApp[];
}

export interface CachedApps {
  scannedAt: number;
  platform: string;
  apps: DetectedApp[];
}

export interface ILocalAgentService {
  loadConfig(): LocalAgentConfig;
  saveConfig(cfg: LocalAgentConfig): void;
  isConfigured(): boolean;
  ping(): Promise<LocalAgentPing>;
  launch(target: string, args?: string[]): Promise<LaunchResult>;
  listApps(): Promise<ListAppsResult>;
  getCachedApps(): CachedApps | null;
  findCachedApp(query: string): DetectedApp | null;
}

const DEFAULT_CONFIG: LocalAgentConfig = {
  url: "http://127.0.0.1:17345",
  token: "",
  enabled: false,
};

function readStorage(): LocalAgentConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function writeStorage(cfg: LocalAgentConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* quota / private mode */
  }
}

function readAppsCache(): CachedApps | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(APPS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.apps || !Array.isArray(parsed.apps)) return null;
    return parsed as CachedApps;
  } catch {
    return null;
  }
}

function writeAppsCache(data: CachedApps): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(APPS_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

function normalizeAppName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.(exe|lnk|url|bat|cmd|msi|app|desktop)$/i, "")
    .replace(/[._\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactAppName(s: string): string {
  return normalizeAppName(s).replace(/\s+/g, "");
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export const localAgentService: ILocalAgentService = {
  loadConfig() {
    return readStorage();
  },

  saveConfig(cfg) {
    writeStorage({
      url: normalizeUrl(cfg.url) || DEFAULT_CONFIG.url,
      token: cfg.token.trim(),
      enabled: !!cfg.enabled,
    });
  },

  isConfigured() {
    const c = readStorage();
    return c.enabled && !!c.url && !!c.token;
  },

  async ping() {
    const c = readStorage();
    if (!c.url || !c.token) {
      throw new Error("Agent local non configuré (URL ou token manquant).");
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    try {
      const resp = await fetch(`${normalizeUrl(c.url)}/ping`, {
        headers: { Authorization: `Bearer ${c.token}` },
        signal: ctrl.signal,
      });
      if (resp.status === 401 || resp.status === 403) {
        throw new Error("Token rejeté par l'agent (401/403).");
      }
      if (!resp.ok) {
        throw new Error(`Agent a répondu ${resp.status}.`);
      }
      return (await resp.json()) as LocalAgentPing;
    } catch (e: any) {
      if (e?.name === "AbortError") {
        throw new Error("Agent injoignable (timeout). Vérifie qu'il tourne.");
      }
      // Erreur réseau brute : souvent CORS ou agent éteint.
      throw new Error(
        e?.message ||
          "Impossible de joindre l'agent local. Vérifie que agent.py tourne sur ton PC.",
      );
    } finally {
      clearTimeout(t);
    }
  },

  async launch(target, args = []) {
    const c = readStorage();
    if (!c.enabled) {
      throw new Error("Agent local désactivé dans les paramètres.");
    }
    if (!c.url || !c.token) {
      throw new Error("Agent local non configuré (URL ou token manquant).");
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try {
      const resp = await fetch(`${normalizeUrl(c.url)}/launch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${c.token}`,
        },
        body: JSON.stringify({ target, args }),
        signal: ctrl.signal,
      });
      const data = await resp.json().catch(() => ({} as any));
      if (!resp.ok) {
        const detail = (data && (data.detail || data.message)) || `HTTP ${resp.status}`;
        return { ok: false, detail: String(detail) };
      }
      return {
        ok: !!data.ok,
        method: data.method,
        target: data.target,
      };
    } catch (e: any) {
      if (e?.name === "AbortError") {
        return { ok: false, detail: "Agent injoignable (timeout)." };
      }
      return { ok: false, detail: e?.message || "Erreur réseau." };
    } finally {
      clearTimeout(t);
    }
  },

  async listApps() {
    const c = readStorage();
    if (!c.url || !c.token) {
      throw new Error("Agent local non configuré (URL ou token manquant).");
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const resp = await fetch(`${normalizeUrl(c.url)}/apps`, {
        headers: { Authorization: `Bearer ${c.token}` },
        signal: ctrl.signal,
      });
      if (resp.status === 404) {
        throw new Error(
          "Ton agent local est trop ancien (endpoint /apps absent). Re-télécharge l'agent et relance-le.",
        );
      }
      if (resp.status === 401 || resp.status === 403) {
        throw new Error("Token rejeté par l'agent (401/403).");
      }
      if (!resp.ok) {
        throw new Error(`Agent a répondu ${resp.status}.`);
      }
      const data = (await resp.json()) as ListAppsResult;
      // Mise en cache pour résolution offline ultérieure.
      writeAppsCache({
        scannedAt: Date.now(),
        platform: data.platform,
        apps: data.apps || [],
      });
      return data;
    } catch (e: any) {
      if (e?.name === "AbortError") {
        throw new Error("Scan trop long (timeout). Réessaie ou réduis tes dossiers.");
      }
      throw new Error(e?.message || "Impossible de lister les applications.");
    } finally {
      clearTimeout(t);
    }
  },

  getCachedApps() {
    return readAppsCache();
  },

  findCachedApp(query: string) {
    const cache = readAppsCache();
    if (!cache || cache.apps.length === 0) return null;
    const q = normalizeAppName(query);
    const compactQ = compactAppName(query);
    if (!q || q.length < 2) return null;

    // 1) Match exact sur nom normalisé
    for (const app of cache.apps) {
      if (normalizeAppName(app.name) === q || compactAppName(app.name) === compactQ) return app;
    }
    // 2) Match "le nom contient toute la query" (préfère .lnk)
    const contains = cache.apps
      .filter((a) => normalizeAppName(a.name).includes(q) || compactAppName(a.name).includes(compactQ))
      .sort((a, b) => {
        if (a.source === "lnk" && b.source !== "lnk") return -1;
        if (b.source === "lnk" && a.source !== "lnk") return 1;
        return normalizeAppName(a.name).length - normalizeAppName(b.name).length;
      });
    if (contains.length > 0) return contains[0];

    // 3) Match "query contient le nom" (utile quand on tape "spotify musique")
    for (const app of cache.apps) {
      const n = normalizeAppName(app.name);
      const cn = compactAppName(app.name);
      if (n.length >= 3 && (q.includes(n) || compactQ.includes(cn))) return app;
    }
    return null;
  },
};