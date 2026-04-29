import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Send, Check, ExternalLink, UserPlus, Edit3, AlertTriangle, ArrowLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

interface Contact {
  id: string;
  name: string;
  phone: string;
  avatarColor: string;
  about?: string;
  isDemo?: boolean;
}

interface WAMessage {
  id: string;
  contactId: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  status: "sent" | "delivered" | "read";
}

const LS_CONTACTS = "wa_contacts";
const LS_MESSAGES = "wa_messages";

const AVATAR_COLORS = [
  "from-cyan-500 to-teal-600",
  "from-cyan-500 to-cyan-700",
  "from-teal-500 to-pink-600",
  "from-indigo-500 to-cyan-600",
];

function loadContacts(): Contact[] {
  try { return JSON.parse(localStorage.getItem(LS_CONTACTS) || "[]"); } catch { return []; }
}
function loadMessages(): WAMessage[] {
  try { return JSON.parse(localStorage.getItem(LS_MESSAGES) || "[]"); } catch { return []; }
}

function initials(name: string): string {
  return name.replace(/\(.*?\)/g, "").trim().split(" ")
    .map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Levenshtein distance (small strings, OK perf). */
function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
    }
  }
  return m[a.length][b.length];
}

interface Scored { contact: Contact; score: number; kind: "exact" | "starts" | "contains" | "token" | "fuzzy" }

/**
 * Returns ranked candidates. Score 1.0 = exact, lower = looser.
 * Includes fuzzy matches (typos) + token-by-token matching.
 */
function rankMatches(contacts: Contact[], query: string): Scored[] {
  const q = normalize(query);
  if (!q) return [];
  const qTokens = q.split(" ");
  const out: Scored[] = [];
  for (const c of contacts) {
    const n = normalize(c.name);
    if (!n) continue;
    if (n === q) { out.push({ contact: c, score: 1, kind: "exact" }); continue; }
    if (n.startsWith(q)) { out.push({ contact: c, score: 0.92, kind: "starts" }); continue; }
    if (n.includes(q)) { out.push({ contact: c, score: 0.85, kind: "contains" }); continue; }
    // token match: any query token matches a name token start
    const nTokens = n.split(" ");
    const tokenHit = qTokens.some((qt) => nTokens.some((nt) => nt.startsWith(qt) || qt.startsWith(nt)));
    if (tokenHit) { out.push({ contact: c, score: 0.7, kind: "token" }); continue; }
    // fuzzy: distance relative to length
    const d = lev(q, n);
    const maxLen = Math.max(q.length, n.length);
    const sim = 1 - d / maxLen;
    if (sim >= 0.6 && d <= 3) out.push({ contact: c, score: sim * 0.7, kind: "fuzzy" });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 6);
}

export function WhatsAppSendWidget({
  contact_name,
  body,
}: {
  contact_name: string;
  body: string;
}) {
  const navigate = useNavigate();
  const [contacts] = useState<Contact[]>(() => loadContacts());
  const [draft, setDraft] = useState(body);
  const [editing, setEditing] = useState(false);
  const [sent, setSent] = useState<{ contactId: string; name: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newPhone, setNewPhone] = useState("");

  const ranked = useMemo(() => rankMatches(contacts, contact_name), [contacts, contact_name]);
  const exact = ranked.find((r) => r.kind === "exact");
  const hasMultipleStrong = ranked.filter((r) => r.score >= 0.7).length > 1;

  // Step machine: "select" (pick contact) → "confirm" (final check) → sent
  // Auto-skip selection only if there is a single exact match.
  const initialStep: "select" | "confirm" =
    exact && ranked.length === 1 ? "confirm" : (ranked.length > 0 ? "select" : "select");
  const [step, setStep] = useState<"select" | "confirm">(initialStep);
  const [selectedId, setSelectedId] = useState<string | null>(
    exact?.contact.id ?? ranked[0]?.contact.id ?? null,
  );
  const [confirmChecked, setConfirmChecked] = useState(false);

  const sendTo = (contact: Contact) => {
    const msg: WAMessage = {
      id: crypto.randomUUID(),
      contactId: contact.id,
      body: draft.trim(),
      fromMe: true,
      timestamp: Date.now(),
      status: "sent",
    };
    const all = loadMessages();
    const next = [...all, msg];
    localStorage.setItem(LS_MESSAGES, JSON.stringify(next));
    // simulate delivered
    setTimeout(() => {
      const cur = loadMessages();
      const updated = cur.map((m) => (m.id === msg.id ? { ...m, status: "delivered" as const } : m));
      localStorage.setItem(LS_MESSAGES, JSON.stringify(updated));
    }, 800);
    setSent({ contactId: contact.id, name: contact.name });
    toast({ title: "Message envoyé", description: `À ${contact.name} sur WhatsApp.` });
  };

  const handleCreateAndSend = () => {
    if (!newPhone.trim()) {
      toast({ title: "Téléphone requis", description: "Ajoute un numéro pour créer le contact." });
      return;
    }
    const c: Contact = {
      id: crypto.randomUUID(),
      name: contact_name,
      phone: newPhone.trim(),
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      about: "Disponible",
    };
    const all = loadContacts();
    localStorage.setItem(LS_CONTACTS, JSON.stringify([...all, c]));
    sendTo(c);
  };

  // === Sent confirmation state ===
  if (sent) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-900/30 to-teal-900/30 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Check className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Message envoyé à {sent.name}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-2 italic">« {draft} »</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-primary hover:bg-primary/10"
            onClick={() => navigate(`/whatsapp?contact=${sent.contactId}`)}
          >
            Ouvrir <ExternalLink className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  // === No matching contact at all (not even fuzzy) ===
  if (ranked.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-white/5 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          WHATSAPP — Aucun contact trouvé
        </div>
        <p className="text-sm text-foreground mb-3">
          Aucun contact ne correspond à "<span className="text-primary font-medium">{contact_name}</span>" dans ton WhatsApp.
          Vérifie l'orthographe, ou crée le contact si c'est une nouvelle personne.
        </p>
        <div className="rounded-lg bg-background/40 border border-border/30 p-3 mb-3">
          <p className="text-[11px] text-muted-foreground mb-1">Message à envoyer</p>
          <p className="text-sm text-foreground italic">« {draft} »</p>
        </div>
        {showCreate ? (
          <div className="space-y-2">
            <Input
              placeholder="Numéro de téléphone (+33...)"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="bg-background/40"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreateAndSend} className="flex-1">
                <Send className="w-3.5 h-3.5 mr-1" /> Créer & envoyer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowCreate(true)} className="flex-1">
              <UserPlus className="w-3.5 h-3.5 mr-1" /> Créer le contact
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate("/whatsapp")}>
              Ouvrir WhatsApp
            </Button>
          </div>
        )}
      </div>
    );
  }

  const selected =
    ranked.find((r) => r.contact.id === selectedId)?.contact ?? ranked[0].contact;

  const kindLabel = (k: Scored["kind"]) =>
    k === "exact" ? "Exact" : k === "starts" ? "Commence par" : k === "contains" ? "Contient" : k === "token" ? "Prénom/nom" : "Approximatif";

  // === STEP 1: SELECT — always shown when match isn't a single exact one ===
  if (step === "select") {
    return (
      <div className="rounded-xl border border-primary/40 bg-gradient-to-br from-teal-900/30 to-teal-900/20 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-3">
          <Users className="w-3.5 h-3.5 text-primary" />
          WHATSAPP — {hasMultipleStrong ? "Plusieurs contacts similaires" : "Vérifie le contact"}
        </div>
        <p className="text-sm text-foreground mb-3">
          Tu as demandé d'écrire à <span className="font-semibold text-primary">{contact_name}</span>.
          {!exact && " Aucun match exact trouvé — choisis le bon contact :"}
          {exact && hasMultipleStrong && " Confirme lequel :"}
        </p>

        <div className="space-y-1.5 mb-3 max-h-64 overflow-y-auto pr-1">
          {ranked.map((r) => {
            const isSel = r.contact.id === selected.id;
            return (
              <button
                key={r.contact.id}
                onClick={() => setSelectedId(r.contact.id)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                  isSel
                    ? "bg-primary/15 border-primary"
                    : "bg-background/40 border-border/40 hover:border-primary/40"
                }`}
              >
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${r.contact.avatarColor} flex items-center justify-center text-white text-xs font-semibold shrink-0`}>
                  {initials(r.contact.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{r.contact.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{r.contact.phone}</p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                  r.kind === "exact" ? "bg-emerald-500/20 text-emerald-300" : "bg-muted/40 text-muted-foreground"
                }`}>
                  {kindLabel(r.kind)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => { setConfirmChecked(false); setStep("confirm"); }}
            disabled={!selected}
            className="flex-1 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white"
          >
            Continuer avec {selected.name.split(" ")[0]}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowCreate(true)}>
            <UserPlus className="w-3.5 h-3.5 mr-1" /> Nouveau
          </Button>
        </div>

        {showCreate && (
          <div className="mt-3 p-3 rounded-lg bg-background/40 border border-border/30 space-y-2">
            <p className="text-[11px] text-muted-foreground">Créer "{contact_name}" comme nouveau contact</p>
            <Input
              placeholder="Numéro de téléphone (+33...)"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="bg-background/40"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreateAndSend} className="flex-1">
                <Send className="w-3.5 h-3.5 mr-1" /> Créer & envoyer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Annuler</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // === STEP 2: CONFIRM — final validation before sending ===
  return (
    <div className="rounded-xl border border-primary/40 bg-gradient-to-br from-teal-900/30 to-teal-900/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Check className="w-3.5 h-3.5 text-primary" />
          WHATSAPP — Confirmer l'envoi
        </div>
        {ranked.length > 1 && (
          <button
            onClick={() => setStep("select")}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" /> Changer
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-3 p-2.5 rounded-lg bg-background/40 border border-primary/20">
        <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${selected.avatarColor} flex items-center justify-center text-white font-semibold shrink-0`}>
          {initials(selected.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{selected.name}</p>
          <p className="text-xs text-muted-foreground truncate">{selected.phone}</p>
        </div>
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="w-full text-sm rounded-lg bg-background/60 border border-border/40 p-2.5 text-foreground resize-none focus:outline-none focus:border-primary/60"
          autoFocus
        />
      ) : (
        <div
          className="rounded-lg bg-gradient-to-br from-cyan-600/30 to-teal-600/20 border border-primary/20 p-3 mb-1 cursor-text"
          onClick={() => setEditing(true)}
        >
          <p className="text-[10px] text-muted-foreground mb-1">MESSAGE</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{draft}</p>
        </div>
      )}

      <label className="flex items-start gap-2 mt-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={confirmChecked}
          onChange={(e) => setConfirmChecked(e.target.checked)}
          className="mt-0.5 accent-primary"
        />
        <span className="text-xs text-muted-foreground leading-snug">
          Je confirme envoyer ce message à <span className="text-foreground font-medium">{selected.name}</span> ({selected.phone}).
        </span>
      </label>

      <div className="flex gap-2 mt-3">
        <Button
          size="sm"
          onClick={() => sendTo(selected)}
          disabled={!draft.trim() || !confirmChecked}
          className="flex-1 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5 mr-1.5" /> Envoyer
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          <Edit3 className="w-3.5 h-3.5 mr-1" /> {editing ? "OK" : "Modifier"}
        </Button>
      </div>
    </div>
  );
}