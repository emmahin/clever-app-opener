import { ExternalLink, AppWindow, Globe, Monitor, Check } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { openAppTarget } from "@/services";

interface Props {
  app_name: string;
  kind: "internal" | "web" | "deeplink";
  target: string;
  fallback_url?: string;
  auto_opened: boolean;
}

export function OpenAppWidget({ app_name, kind, target, fallback_url }: Props) {
  const navigate = useNavigate();
  // Plus aucune ouverture automatique — l'utilisateur DOIT cliquer (règle anti écran violet).
  const [opened, setOpened] = useState(false);

  const Icon = kind === "internal" ? AppWindow : kind === "web" ? Globe : Monitor;
  const kindLabel =
    kind === "internal" ? "Page de l'app" : kind === "web" ? "Site web" : "App native (deep link)";

  const handleOpen = () => {
    openAppTarget({ kind, target, fallbackUrl: fallback_url, navigate });
    setOpened(true);
  };

  return (
    <div className="rounded-xl border border-border/40 bg-white/5 p-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{app_name}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {kindLabel} · {target}
          </div>
        </div>
        {opened ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium">
            <Check className="w-3.5 h-3.5" />
            {kind === "internal" ? "Ouvert" : "Lancé"}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleOpen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Ouvrir
          </button>
        )}
      </div>
      {kind === "deeplink" && (
        <p className="text-[10px] text-muted-foreground/70 mt-2 leading-relaxed">
          ⚠️ Marche uniquement si l'app native est installée. Aucune redirection web automatique.
        </p>
      )}
      {kind === "web" && (
        <p className="text-[10px] text-muted-foreground/70 mt-2 leading-relaxed">
          🌐 Lien web — clique sur « Ouvrir » uniquement si tu veux ouvrir un onglet.
        </p>
      )}
    </div>
  );
}
