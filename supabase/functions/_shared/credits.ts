// Helper crédits partagé entre les edge functions IA.
// Implémente la grille définie par l'utilisateur :
//   total_tokens = (input × complexity) + estimated_output + action_cost
//   credits      = ceil(total_tokens / 500)
//   clamp [1 .. 50]
// Pré-débit (estimation) puis ajustement final avec les vrais tokens d'usage.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TOKENS_PER_CREDIT = 500;
const MIN_CREDITS = 1;
const MAX_CREDITS = 50;

// ---------- Admin bypass ----------
const _adminCache = new Map<string, { value: boolean; ts: number }>();
const ADMIN_CACHE_MS = 60_000;

/** Vérifie si l'utilisateur est admin via la fonction has_role. Cache 60s. */
export async function isAdmin(userId: string): Promise<boolean> {
  const cached = _adminCache.get(userId);
  if (cached && Date.now() - cached.ts < ADMIN_CACHE_MS) return cached.value;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/has_role`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ _user_id: userId, _role: "admin" }),
    });
    const value = r.ok ? (await r.json()) === true : false;
    _adminCache.set(userId, { value, ts: Date.now() });
    return value;
  } catch {
    return false;
  }
}

/** Log gratuit pour audit admin (n'affecte pas le solde). */
export async function logAdminFree(
  userId: string,
  meta: { model?: string; action?: string; inputTokens?: number; outputTokens?: number; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/credit_transactions`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        kind: "admin_free",
        amount: 0,
        balance_after: 0,
        model: meta.model ?? null,
        action: meta.action ?? "chat",
        input_tokens: meta.inputTokens ?? null,
        output_tokens: meta.outputTokens ?? null,
        metadata: meta.metadata ?? {},
      }),
    });
  } catch (e) {
    console.warn("logAdminFree failed", e);
  }
}

// ---------- JWT (extraction user_id sans vérif crypto, RLS service-role gère le reste) ----------
export function getUserIdFromAuth(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.split(".").length < 2) return null;
  try {
    const payload = token.split(".")[1];
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(json);
    return typeof data.sub === "string" ? data.sub : null;
  } catch {
    return null;
  }
}

// ---------- Estimations ----------
function approxTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function messagesToText(messages: any[]): string {
  if (!Array.isArray(messages)) return "";
  return messages.map((m) => {
    if (typeof m?.content === "string") return m.content;
    if (Array.isArray(m?.content)) {
      return m.content.map((p: any) => {
        if (p?.type === "text") return p.text || "";
        if (p?.type === "image_url") return "[image]";
        return "";
      }).join(" ");
    }
    return "";
  }).join("\n");
}

/** Multiplicateur de complexité d'après le dernier message + flags. */
function complexityMultiplier(opts: {
  text: string;
  inputTokens: number;
  deepThink?: boolean;
  forceTool?: string | null;
  hasAttachments?: boolean;
}): number {
  if (opts.deepThink) return 4;
  if (opts.forceTool === "code") return 4;

  const t = (opts.text || "").toLowerCase();
  const veryComplex =
    /\b(crée|cree|construis|implémente|implemente|écris|ecris|génère|genere|build|api|architecture|refactor|debug|stack trace|algorithme|exercice complet|projet complet)\b/.test(t) ||
    /```/.test(opts.text);
  if (veryComplex) return 4;

  const complex =
    /\b(analyse|stratégie|strategie|compar(e|aison)|raisonn|optimis|évalue|evalue|pourquoi|comment fonctionne|explique en détail|explique en detail|résous|resous|démontre|demontre)\b/.test(t);
  if (complex) return 2.5;

  const medium =
    /\b(explique|résume|resume|reformule|détaille|detaille|développe|developpe|aide-?moi)\b/.test(t) ||
    opts.inputTokens > 400;
  if (medium) return 1.5;

  return 1; // simple
}

/** Output estimé (tokens) selon longueur input + complexité. */
function estimateOutputTokens(inputTokens: number, multiplier: number): number {
  // base raisonnable : réponse normale 300-800
  if (multiplier >= 4) return 2500;
  if (multiplier >= 2.5) return 1200;
  if (multiplier >= 1.5) return 600;
  // simple
  return inputTokens > 200 ? 400 : 200;
}

/** Surcoût d'action (outils / agent). */
function actionCost(opts: {
  forceTool?: string | null;
  webSearch?: boolean;
  text?: string;
}): number {
  let cost = 0;
  if (opts.forceTool === "image") cost += 1500;
  if (opts.forceTool === "code") cost += 1000;
  if (opts.webSearch) cost += 500;

  const t = (opts.text || "").toLowerCase();
  if (/\b(ouvre|lance|envoie|whatsapp|automation)\b/.test(t)) cost += 2000;
  if (/\b(agent|multi[- ]?step|plusieurs étapes|plusieurs etapes)\b/.test(t)) cost += 3000;
  return cost;
}

export interface EstimateInput {
  messages: any[];
  attachments?: any[];
  webSearch?: boolean;
  deepThink?: boolean;
  forceTool?: string | null;
}

export interface EstimateResult {
  credits: number;
  inputTokens: number;
  estimatedOutputTokens: number;
  multiplier: number;
  actionTokens: number;
  totalTokens: number;
}

export function estimateCreditsForRequest(input: EstimateInput): EstimateResult {
  const fullText = messagesToText(input.messages);
  const lastUser = [...(input.messages || [])].reverse().find((m) => m?.role === "user");
  const lastUserText = typeof lastUser?.content === "string"
    ? lastUser.content
    : Array.isArray(lastUser?.content)
      ? lastUser.content.map((p: any) => p?.text || "").join(" ")
      : "";

  // input = derniers échanges (cap pour éviter explosion historique)
  const inputTokens = Math.min(approxTokens(fullText), 8000) +
    (Array.isArray(input.attachments) ? input.attachments.length * 200 : 0);

  const multiplier = complexityMultiplier({
    text: lastUserText,
    inputTokens,
    deepThink: input.deepThink,
    forceTool: input.forceTool,
    hasAttachments: !!input.attachments?.length,
  });

  const estimatedOutputTokens = estimateOutputTokens(inputTokens, multiplier);
  const actionTokens = actionCost({
    forceTool: input.forceTool,
    webSearch: input.webSearch,
    text: lastUserText,
  });

  const totalTokens = Math.ceil(inputTokens * multiplier) + estimatedOutputTokens + actionTokens;
  let credits = Math.ceil(totalTokens / TOKENS_PER_CREDIT);
  if (credits < MIN_CREDITS) credits = MIN_CREDITS;
  if (credits > MAX_CREDITS) credits = MAX_CREDITS;

  return { credits, inputTokens, estimatedOutputTokens, multiplier, actionTokens, totalTokens };
}

/** Calcule le coût final à partir des vrais tokens (clamp + grille identique). */
export function computeFinalCredits(opts: {
  realInputTokens: number;
  realOutputTokens: number;
  multiplier: number;
  actionTokens: number;
}): number {
  const total = Math.ceil(opts.realInputTokens * opts.multiplier) + opts.realOutputTokens + opts.actionTokens;
  let credits = Math.ceil(total / TOKENS_PER_CREDIT);
  if (credits < MIN_CREDITS) credits = MIN_CREDITS;
  if (credits > MAX_CREDITS) credits = MAX_CREDITS;
  return credits;
}

// ---------- DB calls (service role) ----------
async function rpc(fn: string, body: Record<string, unknown>): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) {
    console.error(`rpc ${fn} failed`, r.status, text);
    throw new Error(`rpc ${fn} ${r.status}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

/** Débite des crédits. Retourne {ok, balance, error?}. */
export async function debitCredits(
  userId: string,
  amount: number,
  meta: {
    model?: string;
    action?: string;
    inputTokens?: number;
    outputTokens?: number;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<{ ok: boolean; balance?: number; error?: string }> {
  if (amount <= 0) return { ok: true };
  try {
    const res = await rpc("consume_credits", {
      _user_id: userId,
      _amount: amount,
      _model: meta.model ?? null,
      _action: meta.action ?? "chat",
      _input_tokens: meta.inputTokens ?? null,
      _output_tokens: meta.outputTokens ?? null,
      _metadata: meta.metadata ?? {},
    });
    if (res?.ok) return { ok: true, balance: res.balance };
    return { ok: false, error: res?.error || "debit_failed", balance: res?.balance };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Recrédite (utilisé pour rembourser un sur-débit d'estimation). */
export async function refundCredits(
  userId: string,
  amount: number,
  meta: { metadata?: Record<string, unknown> } = {},
): Promise<void> {
  if (amount <= 0) return;
  try {
    await rpc("add_credits", {
      _user_id: userId,
      _amount: amount,
      _kind: "refund",
      _bucket: "subscription",
      _metadata: meta.metadata ?? {},
    });
  } catch (e) {
    console.warn("refund failed", e);
  }
}