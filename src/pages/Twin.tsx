import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, Mic, Phone, PhoneOff, Plus, Trash2, Calendar, Brain, Loader2 } from "lucide-react";
import { Sidebar } from "@/components/chatbot/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { twinMemoryService, type UserMemory, type ScheduleEventDB, type MemoryCategory } from "@/services";
import { useTwinVoice } from "@/hooks/useTwinVoice";

const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  habit: "Habitude",
  preference: "Préférence",
  goal: "Objectif",
  fact: "Fait",
  emotion: "Émotion",
  relationship: "Relation",
};

const CATEGORY_COLOR: Record<MemoryCategory, string> = {
  habit: "bg-blue-500/20 text-blue-200 border-blue-400/30",
  preference: "bg-purple-500/20 text-purple-200 border-purple-400/30",
  goal: "bg-emerald-500/20 text-emerald-200 border-emerald-400/30",
  fact: "bg-slate-500/20 text-slate-200 border-slate-400/30",
  emotion: "bg-pink-500/20 text-pink-200 border-pink-400/30",
  relationship: "bg-amber-500/20 text-amber-200 border-amber-400/30",
};

export default function Twin() {
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [events, setEvents] = useState<ScheduleEventDB[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [newMem, setNewMem] = useState({ category: "habit" as MemoryCategory, content: "" });
  const [newEvent, setNewEvent] = useState({ title: "", start_iso: "", location: "" });

  // ─── Load memories + events ───
  const refreshAll = useCallback(async () => {
    setLoadingData(true);
    try {
      const [m, e] = await Promise.all([
        twinMemoryService.listMemories(),
        twinMemoryService.listEvents(60),
      ]);
      setMemories(m);
      setEvents(e);
    } catch (err) {
      console.error(err);
      toast.error("Impossible de charger les données du double.");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  // ─── Voice loop (Lovable AI + STT navigateur + TTS ElevenLabs/fallback) ───
  const voice = useTwinVoice({
    onError: (msg) => toast.error(msg),
    onMemoryChange: () => { refreshAll(); },
    getMemoriesContext: () =>
      memories.slice(0, 30).map((m) => `- [${CATEGORY_LABEL[m.category]}] ${m.content}`).join("\n"),
    getEventsContext: () =>
      events.slice(0, 15).map((e) => {
        const d = new Date(e.start_iso);
        return `- ${d.toLocaleString("fr-FR")} : ${e.title}${e.location ? ` (${e.location})` : ""}`;
      }).join("\n"),
  });

  const isConnected = voice.isCallActive;
  const isSpeaking = voice.status === "speaking";
  const isThinking = voice.status === "thinking";

  // ─── Memory actions ───
  const addMemory = async () => {
    if (!newMem.content.trim()) return;
    try {
      await twinMemoryService.addMemory({ category: newMem.category, content: newMem.content.trim(), source: "manual" });
      setNewMem({ category: "habit", content: "" });
      await refreshAll();
      toast.success("Souvenir ajouté");
    } catch (err: any) {
      toast.error(err?.message || "Échec d'ajout du souvenir");
    }
  };

  const deleteMemory = async (id: string) => {
    try {
      await twinMemoryService.deleteMemory(id);
      setMemories((m) => m.filter((x) => x.id !== id));
    } catch (err: any) { toast.error(err?.message || "Échec de suppression"); }
  };

  // ─── Event actions ───
  const addEvent = async () => {
    if (!newEvent.title.trim() || !newEvent.start_iso) {
      toast.error("Titre et date/heure requis.");
      return;
    }
    try {
      const iso = new Date(newEvent.start_iso).toISOString();
      await twinMemoryService.addEvent({ title: newEvent.title.trim(), start_iso: iso, location: newEvent.location || undefined, source: "manual" });
      setNewEvent({ title: "", start_iso: "", location: "" });
      await refreshAll();
      toast.success("Événement ajouté");
    } catch (err: any) {
      toast.error(err?.message || "Échec d'ajout d'événement");
    }
  };

  const deleteEvent = async (id: string) => {
    try {
      await twinMemoryService.deleteEvent(id);
      setEvents((e) => e.filter((x) => x.id !== id));
    } catch (err: any) { toast.error(err?.message || "Échec de suppression"); }
  };

  const groupedMemories = useMemo(() => {
    const g: Record<MemoryCategory, UserMemory[]> = { habit: [], preference: [], goal: [], fact: [], emotion: [], relationship: [] };
    for (const m of memories) g[m.category].push(m);
    return g;
  }, [memories]);

  return (
    <div
      className="min-h-screen text-foreground"
      style={{ background: "linear-gradient(180deg, hsl(0,0%,4%), hsl(275,55%,12%))" }}
    >
      <Sidebar />
      <main className="md:ml-[var(--sidebar-w,280px)] transition-[margin] duration-300">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 mb-6 pl-12 md:pl-0">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">Double numérique</h1>
                <p className="text-sm text-white/60">Votre assistant de développement personnel à voix haute</p>
              </div>
            </div>
            {!voice.supported && (
              <span className="text-xs text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-lg px-2.5 py-1">
                Reconnaissance vocale non supportée — utilisez Chrome/Edge/Safari
              </span>
            )}
          </div>

          {/* Voice call card */}
          <section className="rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md p-6 md:p-8 mb-6">
            <div className="flex flex-col items-center gap-5">
              {/* Orb */}
              <div className="relative">
                <div
                  className={
                    "w-32 h-32 md:w-40 md:h-40 rounded-full flex items-center justify-center transition-all duration-500 " +
                    (isConnected
                      ? "bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500 shadow-[0_0_60px_rgba(217,70,239,0.6)] scale-110"
                      : "bg-gradient-to-br from-purple-700/40 to-pink-700/40 border border-white/10")
                  }
                >
                  {isSpeaking ? (
                    <div className="flex items-end gap-1 h-12">
                      <div className="w-1.5 bg-white rounded-full animate-pulse" style={{ height: "60%", animationDelay: "0ms" }} />
                      <div className="w-1.5 bg-white rounded-full animate-pulse" style={{ height: "100%", animationDelay: "150ms" }} />
                      <div className="w-1.5 bg-white rounded-full animate-pulse" style={{ height: "75%", animationDelay: "300ms" }} />
                      <div className="w-1.5 bg-white rounded-full animate-pulse" style={{ height: "90%", animationDelay: "450ms" }} />
                    </div>
                  ) : isConnected ? (
                    <Mic className="w-12 h-12 text-white" />
                  ) : (
                    <Sparkles className="w-12 h-12 text-white/70" />
                  )}
                </div>
                {isConnected && (
                  <span className="absolute -top-1 -right-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-semibold uppercase tracking-wider shadow-md">
                    En direct
                  </span>
                )}
              </div>

              <div className="text-center">
                <p className="text-white font-medium">
                  {isConnected
                    ? isSpeaking ? "Votre double parle…" : isThinking ? "Réflexion…" : "À l'écoute…"
                    : "Prêt à discuter"}
                </p>
                <p className="text-white/55 text-sm mt-1">
                  {isConnected
                    ? "Parlez naturellement, il vous écoute."
                    : "Cliquez sur appeler pour commencer une conversation vocale."}
                </p>
              </div>

              {!isConnected ? (
                <Button
                  onClick={voice.startCall}
                  disabled={!voice.supported}
                  size="lg"
                  className="rounded-full px-8 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/30"
                >
                  <Phone className="w-5 h-5 mr-2" /> Appeler mon double
                </Button>
              ) : (
                <Button onClick={voice.endCall} size="lg" variant="destructive" className="rounded-full px-8">
                  <PhoneOff className="w-5 h-5 mr-2" /> Raccrocher
                </Button>
              )}
            </div>

            {/* Live transcript */}
            {(voice.transcript.length > 0 || voice.interim) && (
              <div className="mt-6 border-t border-white/10 pt-5">
                <div className="text-xs uppercase tracking-wider text-white/45 font-semibold mb-2">Transcription</div>
                <ScrollArea className="h-48 pr-2">
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
          </section>

          {/* Tabs : Mémoire / Agenda */}
          <Tabs defaultValue="memory" className="w-full">
            <TabsList className="bg-white/5 border border-white/10">
              <TabsTrigger value="memory" className="data-[state=active]:bg-white/15 data-[state=active]:text-white text-white/70">
                <Brain className="w-4 h-4 mr-2" /> Mémoire ({memories.length})
              </TabsTrigger>
              <TabsTrigger value="schedule" className="data-[state=active]:bg-white/15 data-[state=active]:text-white text-white/70">
                <Calendar className="w-4 h-4 mr-2" /> Agenda ({events.length})
              </TabsTrigger>
            </TabsList>

            {/* Mémoire */}
            <TabsContent value="memory" className="mt-4">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 md:p-6">
                {/* Add */}
                <div className="flex flex-col md:flex-row gap-2 mb-5">
                  <select
                    value={newMem.category}
                    onChange={(e) => setNewMem({ ...newMem, category: e.target.value as MemoryCategory })}
                    className="bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-white text-sm md:w-44 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                  >
                    {(Object.keys(CATEGORY_LABEL) as MemoryCategory[]).map((c) => (
                      <option key={c} value={c} className="bg-zinc-900">{CATEGORY_LABEL[c]}</option>
                    ))}
                  </select>
                  <Input
                    value={newMem.content}
                    onChange={(e) => setNewMem({ ...newMem, content: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") addMemory(); }}
                    placeholder="Ex : Je médite 10 min chaque matin"
                    className="bg-white/10 border-white/15 text-white placeholder:text-white/40"
                  />
                  <Button onClick={addMemory} className="bg-purple-500 hover:bg-purple-600 text-white">
                    <Plus className="w-4 h-4 mr-1" /> Ajouter
                  </Button>
                </div>

                {loadingData ? (
                  <div className="text-center py-8 text-white/50"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
                ) : memories.length === 0 ? (
                  <div className="text-center py-10 text-white/50 text-sm">
                    Aucun souvenir pour l'instant. Discutez avec votre double — il enregistrera vos habitudes ici.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(Object.keys(groupedMemories) as MemoryCategory[]).map((cat) => {
                      const list = groupedMemories[cat];
                      if (list.length === 0) return null;
                      return (
                        <div key={cat}>
                          <div className="text-[11px] uppercase tracking-wider text-white/45 font-semibold mb-2">
                            {CATEGORY_LABEL[cat]} · {list.length}
                          </div>
                          <ul className="space-y-1.5">
                            {list.map((m) => (
                              <li key={m.id} className="group flex items-start gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5">
                                <Badge variant="outline" className={"text-[10px] " + CATEGORY_COLOR[m.category]}>
                                  {"★".repeat(m.importance)}
                                </Badge>
                                <span className="flex-1 text-sm text-white">{m.content}</span>
                                <button onClick={() => deleteMemory(m.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-red-300 transition">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Agenda */}
            <TabsContent value="schedule" className="mt-4">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 md:p-6">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_1fr_auto] gap-2 mb-5">
                  <Input
                    value={newEvent.title}
                    onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                    placeholder="Titre de l'événement"
                    className="bg-white/10 border-white/15 text-white placeholder:text-white/40"
                  />
                  <Input
                    type="datetime-local"
                    value={newEvent.start_iso}
                    onChange={(e) => setNewEvent({ ...newEvent, start_iso: e.target.value })}
                    className="bg-white/10 border-white/15 text-white"
                  />
                  <Input
                    value={newEvent.location}
                    onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                    placeholder="Lieu (optionnel)"
                    className="bg-white/10 border-white/15 text-white placeholder:text-white/40"
                  />
                  <Button onClick={addEvent} className="bg-purple-500 hover:bg-purple-600 text-white">
                    <Plus className="w-4 h-4 mr-1" /> Ajouter
                  </Button>
                </div>

                {loadingData ? (
                  <div className="text-center py-8 text-white/50"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
                ) : events.length === 0 ? (
                  <div className="text-center py-10 text-white/50 text-sm">
                    Aucun événement à venir. Dites à votre double : « Note un rendez-vous chez le dentiste mardi 14h ».
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {events.map((e) => {
                      const d = new Date(e.start_iso);
                      return (
                        <li key={e.id} className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5">
                          <div className="text-center min-w-[56px]">
                            <div className="text-[10px] uppercase text-purple-300 font-semibold">{d.toLocaleDateString("fr-FR", { month: "short" })}</div>
                            <div className="text-2xl font-bold text-white leading-none">{d.getDate()}</div>
                            <div className="text-[10px] text-white/50">{d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">{e.title}</div>
                            {e.location && <div className="text-xs text-white/55 truncate">📍 {e.location}</div>}
                            {e.source === "ai" && <div className="text-[10px] text-purple-300 mt-0.5">Ajouté par votre double</div>}
                          </div>
                          <button onClick={() => deleteEvent(e.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-500/20 text-red-300 transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}