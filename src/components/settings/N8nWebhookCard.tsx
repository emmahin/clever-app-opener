import { useEffect, useState } from "react";
import { Workflow, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "n8n_webhook_url";

export function N8nWebhookCard() {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setUrl(localStorage.getItem(STORAGE_KEY) || "");
  }, []);

  const handleSave = () => {
    const trimmed = url.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      toast.error("L'URL doit commencer par http(s)://");
      return;
    }
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    toast.success(trimmed ? "Webhook n8n enregistré" : "Webhook n8n supprimé");
  };

  const handleTest = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("Renseigne d'abord l'URL");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch(trimmed, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "lia-voice", test: true, timestamp: new Date().toISOString() }),
      });
      if (res.ok) toast.success(`Webhook OK (${res.status})`);
      else toast.error(`Webhook a répondu ${res.status}`);
    } catch (err) {
      toast.error("Échec réseau ou CORS");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Workflow className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">Webhook n8n</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Colle l'URL d'un webhook n8n. Lia pourra le déclencher quand tu dis
            <span className="font-medium"> « lance le workflow »</span> ou <span className="font-medium">« déclenche n8n »</span>.
          </p>
        </div>
      </div>

      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://mon-instance.n8n.cloud/webhook/xxxx"
        className="w-full text-sm bg-background border border-border/60 rounded-lg px-3 py-2 outline-none focus:border-primary"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 text-sm bg-primary text-primary-foreground rounded-lg py-2 hover:opacity-90 transition flex items-center justify-center gap-2"
        >
          {saved ? <Check className="w-4 h-4" /> : null}
          {saved ? "Enregistré" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="flex-1 text-sm bg-secondary text-secondary-foreground rounded-lg py-2 hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Tester
        </button>
      </div>
    </div>
  );
}