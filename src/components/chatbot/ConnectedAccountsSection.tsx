import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, MessageCircle, Bot, FileText, Mail, Globe, KeyRound } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  listAccounts, addAccount, removeAccount, ConnectedAccount, ConnectedProvider,
} from "@/services/connectedAccountsService";

const PROVIDERS: { id: ConnectedProvider; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="w-4 h-4" />, hint: "Token WhatsApp Business API" },
  { id: "chatgpt", label: "ChatGPT (OpenAI)", icon: <Bot className="w-4 h-4" />, hint: "Clé API OpenAI (sk-…)" },
  { id: "notion", label: "Notion", icon: <FileText className="w-4 h-4" />, hint: "Integration token Notion" },
  { id: "gmail", label: "Gmail / Google", icon: <Mail className="w-4 h-4" />, hint: "Token OAuth Google" },
  { id: "google", label: "Autre service Google", icon: <Globe className="w-4 h-4" />, hint: "Clé / token" },
];

export function ConnectedAccountsSection() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<ConnectedProvider | null>(null);
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setAccounts(await listAccounts());
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const onAdd = async () => {
    if (!adding || !apiKey.trim()) return;
    setSubmitting(true);
    const res = await addAccount({
      provider: adding,
      account_label: label.trim() || PROVIDERS.find((p) => p.id === adding)?.label || "",
      credentials: { api_key: apiKey.trim() },
    });
    setSubmitting(false);
    if (res) {
      toast.success("Compte ajouté");
      setAdding(null);
      setLabel("");
      setApiKey("");
      refresh();
    } else {
      toast.error("Impossible d'ajouter ce compte");
    }
  };

  const onRemove = async (id: string) => {
    if (!confirm("Supprimer ce compte ?")) return;
    if (await removeAccount(id)) {
      toast.success("Compte supprimé");
      refresh();
    }
  };

  const providerMeta = (id: string) => PROVIDERS.find((p) => p.id === id);

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aucun compte connecté. Ajoute WhatsApp, ChatGPT, Notion, etc. pour les utiliser dans tes conversations.
        </p>
      ) : (
        <ul className="space-y-2">
          {accounts.map((a) => {
            const meta = providerMeta(a.provider);
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-secondary/40 border border-border/60">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                    {meta?.icon ?? <KeyRound className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{a.account_label || meta?.label || a.provider}</div>
                    <div className="text-xs text-muted-foreground truncate">{meta?.label ?? a.provider} · {new Date(a.connected_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <button
                  onClick={() => onRemove(a.id)}
                  className="p-2 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                  title="Supprimer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="px-4 py-2 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" /> Ajouter un compte
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {PROVIDERS.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => { setAdding(p.id); setLabel(""); setApiKey(""); }}>
              {p.icon} <span className="ml-2">{p.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!adding} onOpenChange={(o) => !o && setAdding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connecter {PROVIDERS.find((p) => p.id === adding)?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Libellé (facultatif)</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex : Compte perso"
                className="w-full px-3 py-2 rounded-lg bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {PROVIDERS.find((p) => p.id === adding)?.hint}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Colle ton token / clé API ici"
                className="w-full px-3 py-2 rounded-lg bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-primary font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Stocké de manière privée et chiffrée. Visible uniquement par toi.
              </p>
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setAdding(null)}
              className="px-4 py-2 rounded-lg bg-secondary text-sm hover:bg-secondary/80 transition-colors"
            >Annuler</button>
            <button
              onClick={onAdd}
              disabled={submitting || !apiKey.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-60"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Connecter
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
