import { useEffect } from "react";
import { Sparkles, Mic, PhoneOff, Eraser, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTwinVoiceContext } from "@/contexts/TwinVoiceProvider";
import { twinMemoryService, type MemoryCategory } from "@/services";

const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  habit: "Habitude",
  preference: "Préférence",
  goal: "Objectif",
  fact: "Fait",
  emotion: "Émotion",
  relationship: "Relation",
};

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Modale d'appel vocal du double numérique — branchée sur TwinVoiceProvider.
 * Charge la mémoire + l'agenda depuis Supabase et les fournit au LLM via
 * setContextProviders, sans dépendre d'une page parente.
 */
export function TwinCallModal({ open, onClose }: Props) {
  const voice = useTwinVoiceContext();

  // À l'ouverture, on (re)charge mémoire + agenda et on les expose au provider.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const [memories, events] = await Promise.all([
          twinMemoryService.listMemories(),
          twinMemoryService.listEvents(60),
        ]);
        if (cancelled) return;
        voice.setContextProviders({
          onError: (msg: string) => toast.error(msg),
          onMemoryChange: () => {
            // Recharge silencieusement après un tool call
            twinMemoryService.listMemories().then((m) => {
              voice.setContextProviders({
                getMemoriesContext: () =>
                  m.slice(0, 30).map((x) => `- [${CATEGORY_LABEL[x.category]}] ${x.content}`).join("\n"),
              });
            }).catch(() => { /* ignore */ });
            twinMemoryService.listEvents(60).then((e) => {
              voice.setContextProviders({
                getEventsContext: () =>
                  e.slice(0, 15).map((x) => {
                    const d = new Date(x.start_iso);
                    return `- ${d.toLocaleString("fr-FR")} : ${x.title}${x.location ? ` (${x.location})` : ""}`;
                  }).join("\n"),
              });
            }).catch(() => { /* ignore */ });
          },
          getMemoriesContext: () =>
            memories.slice(0, 30).map((m) => `- [${CATEGORY_LABEL[m.category]}] ${m.content}`).join("\n"),
          getEventsContext: () =>
            events.slice(0, 15).map((e) => {
              const d = new Date(e.start_iso);
              return `- ${d.toLocaleString("fr-FR")} : ${e.title}${e.location ? ` (${e.location})` : ""}`;
            }).join("\n"),
        });
      } catch (err) {
        console.warn("[TwinCallModal] context load failed", err);
      }
    })();
    return () => { cancelled = true; };
  }, [open, voice]);

  // Auto-démarrage à l'ouverture
  useEffect(() => {
    if (open && !voice.isCallActive) {
      voice.startCall();
    }
    if (!open && voice.isCallActive) {
      voice.endCall();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const isConnected = voice.isCallActive;
  const isSpeaking = voice.status === "speaking";
  const isThinking = voice.status === "thinking";

  const handleClose = () => {
    voice.endCall();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "radial-gradient(ellipse at center, hsl(275 60% 12% / 0.96), hsl(0 0% 2% / 0.98))" }}
    >
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/5 hover:bg-white/15 text-white/80 hover:text-white flex items-center justify-center transition"
        aria-label="Fermer"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="w-full max-w-2xl flex flex-col items-center gap-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-white/45 font-semibold">Double numérique</p>
          <h2 className="text-2xl md:text-3xl font-bold text-white mt-1">Appel vocal</h2>
          {!voice.supported && (
            <p className="text-xs text-amber-300 mt-2">
              Reconnaissance vocale non supportée — utilisez Chrome, Edge ou Safari.
            </p>
          )}
        </div>

        {/* Orb */}
        <div className="relative">
          <div
            className={
              "w-40 h-40 md:w-52 md:h-52 rounded-full flex items-center justify-center transition-all duration-500 " +
              (isConnected
                ? "bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500 shadow-[0_0_80px_rgba(217,70,239,0.6)] scale-105"
                : "bg-gradient-to-br from-purple-700/40 to-pink-700/40 border border-white/10")
            }
          >
            {isSpeaking ? (
              <div className="flex items-end gap-1.5 h-16">
                <div className="w-2 bg-white rounded-full animate-pulse" style={{ height: "60%", animationDelay: "0ms" }} />
                <div className="w-2 bg-white rounded-full animate-pulse" style={{ height: "100%", animationDelay: "150ms" }} />
                <div className="w-2 bg-white rounded-full animate-pulse" style={{ height: "75%", animationDelay: "300ms" }} />
                <div className="w-2 bg-white rounded-full animate-pulse" style={{ height: "90%", animationDelay: "450ms" }} />
              </div>
            ) : isConnected ? (
              <Mic className="w-14 h-14 text-white" />
            ) : (
              <Sparkles className="w-14 h-14 text-white/70" />
            )}
          </div>
          {isConnected && (
            <span className="absolute -top-1 -right-1 px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-semibold uppercase tracking-wider shadow-md">
              En direct
            </span>
          )}
        </div>

        <div className="text-center min-h-[48px]">
          <p className="text-white font-medium">
            {isConnected
              ? isSpeaking ? "Votre double parle…" : isThinking ? "Réflexion…" : "À l'écoute…"
              : "Connexion…"}
          </p>
          <p className="text-white/55 text-sm mt-1">
            {isConnected
              ? "Parlez naturellement, il a accès à vos habitudes et votre agenda."
              : "Préparation du contexte…"}
          </p>
        </div>

        {/* Live transcript */}
        {(voice.transcript.length > 0 || voice.interim) && (
          <div className="w-full rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wider text-white/45 font-semibold">
                Conversation {voice.transcript.length > 0 ? `(${voice.transcript.length})` : ""}
              </div>
              <button
                onClick={voice.clearTranscript}
                className="text-[11px] text-white/50 hover:text-white inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/5 transition"
              >
                <Eraser className="w-3 h-3" /> Effacer
              </button>
            </div>
            <ScrollArea className="h-40 pr-2">
              <div className="space-y-2">
                {voice.transcript.map((l) => (
                  <div key={l.id} className={"text-sm " + (l.role === "user" ? "text-white" : "text-purple-200")}>
                    <span className="font-semibold mr-2">{l.role === "user" ? "Vous :" : "Double :"}</span>
                    {l.text}
                  </div>
                ))}
                {voice.interim && (
                  <div className="text-sm text-white/50 italic">
                    <span className="font-semibold mr-2">Vous :</span>{voice.interim}…
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        <Button
          onClick={handleClose}
          size="lg"
          variant="destructive"
          className="rounded-full px-8"
        >
          <PhoneOff className="w-5 h-5 mr-2" /> Raccrocher
        </Button>
      </div>
    </div>
  );
}