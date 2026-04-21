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
  "from-purple-500 to-fuchsia-600",
  "from-violet-500 to-purple-700",
  "from-fuchsia-500 to-pink-600",
  "from-indigo-500 to-violet-600",
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

  const matches = useMemo(() => findMatches(contacts, contact_name), [contacts, contact_name]);
  const [selectedId, setSelectedId] = useState<string | null>(matches[0]?.id ?? null);

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
      <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-900/30 to-purple-900/30 p-4">
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

  // === No matching contact ===
  if (matches.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-white/5 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-3">
          <MessageCircle className="w-3.5 h-3.5 text-primary" />
          WHATSAPP — Contact introuvable
        </div>
        <p className="text-sm text-foreground mb-3">
          Aucun contact "<span className="text-primary font-medium">{contact_name}</span>" dans ton WhatsApp.
          Tu peux le créer rapidement :
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

  const selected = matches.find((c) => c.id === selectedId) || matches[0];

  // === Match(es) found — preview & confirm ===
  return (
    <div className="rounded-xl border border-primary/40 bg-gradient-to-br from-purple-900/30 to-fuchsia-900/20 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-3">
        <MessageCircle className="w-3.5 h-3.5 text-primary" />
        WHATSAPP — Confirmer l'envoi
      </div>

      {matches.length > 1 && (
        <div className="mb-3">
          <p className="text-[11px] text-muted-foreground mb-1.5">Plusieurs contacts trouvés — choisis :</p>
          <div className="flex flex-wrap gap-1.5">
            {matches.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  selected.id === c.id
                    ? "bg-primary/20 border-primary text-foreground"
                    : "bg-background/40 border-border/40 text-muted-foreground hover:border-primary/40"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
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
          className="rounded-lg bg-gradient-to-br from-purple-600/30 to-fuchsia-600/20 border border-primary/20 p-3 mb-3 cursor-text"
          onClick={() => setEditing(true)}
        >
          <p className="text-sm text-foreground whitespace-pre-wrap">{draft}</p>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <Button
          size="sm"
          onClick={() => sendTo(selected)}
          disabled={!draft.trim()}
          className="flex-1 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white"
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