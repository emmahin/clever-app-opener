import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import { Calendar, Plus, Trash2, Loader2, Link2, Unlink, Upload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { twinMemoryService, googleCalendarService, type ScheduleEventDB, type GCalStatus } from "@/services";

export default function Agenda() {
  const [events, setEvents] = useState<ScheduleEventDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEvent, setNewEvent] = useState({ title: "", start_iso: "", location: "" });

  const [gcalStatus, setGcalStatus] = useState<GCalStatus | null>(null);
  const [gcalBusy, setGcalBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const e = await twinMemoryService.listEvents(60);
      setEvents(e);
    } catch (err: any) {
      toast.error(err?.message || "Impossible de charger l'agenda");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshGcal = useCallback(async () => {
    try {
      const s = await googleCalendarService.getStatus();
      setGcalStatus(s);
    } catch (e) {
      console.warn("gcal status failed", e);
    }
  }, []);

  useEffect(() => { refresh(); refreshGcal(); }, [refresh, refreshGcal]);

  const addEvent = async () => {
    if (!newEvent.title.trim() || !newEvent.start_iso) {
      toast.error("Titre et date/heure requis.");
      return;
    }
    try {
      const iso = new Date(newEvent.start_iso).toISOString();
      const created = await twinMemoryService.addEvent({
        title: newEvent.title.trim(),
        start_iso: iso,
        location: newEvent.location || undefined,
        source: "manual",
      });
      setNewEvent({ title: "", start_iso: "", location: "" });
      await refresh();
      toast.success("Événement ajouté");
      if (gcalStatus?.connected) {
        try {
          await googleCalendarService.pushEvent(created.id);
          await refresh();
          toast.success("Synchronisé avec Google Calendar");
        } catch (e: any) {
          toast.error("Push Google échoué : " + (e?.message || "inconnu"));
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Échec d'ajout");
    }
  };

  const deleteEvent = async (id: string) => {
    try {
      await twinMemoryService.deleteEvent(id);
      setEvents((e) => e.filter((x) => x.id !== id));
    } catch (err: any) {
      toast.error(err?.message || "Échec");
    }
  };

  const onConnectGoogle = async () => {
    setGcalBusy(true);
    try {
      await googleCalendarService.connect();
    } catch (e: any) {
      toast.error(e?.message || "Connexion impossible");
      setGcalBusy(false);
    }
  };

  const onDisconnectGoogle = async () => {
    if (!confirm("Déconnecter Google Calendar ?")) return;
    setGcalBusy(true);
    try {
      await googleCalendarService.disconnect();
      await refreshGcal();
      toast.success("Google Calendar déconnecté");
    } catch (e: any) {
      toast.error(e?.message || "Déconnexion impossible");
    } finally {
      setGcalBusy(false);
    }
  };

  const onPullGoogle = async () => {
    setGcalBusy(true);
    try {
      const r = await googleCalendarService.pull();
      await refresh();
      toast.success(`Importé : ${r.imported}, mis à jour : ${r.updated}`);
    } catch (e: any) {
      toast.error(e?.message || "Import impossible");
    } finally {
      setGcalBusy(false);
    }
  };

  const onPushOne = async (id: string) => {
    setGcalBusy(true);
    try {
      await googleCalendarService.pushEvent(id);
      await refresh();
      toast.success("Envoyé vers Google");
    } catch (e: any) {
      toast.error(e?.message || "Push échoué");
    } finally {
      setGcalBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <Header />
      <main className="ml-0 md:[margin-left:var(--sidebar-w,280px)] md:transition-[margin-left] md:duration-300 pt-14 min-h-screen">
        <div className="max-w-4xl mx-auto px-3 md:px-6 py-6 md:py-8 space-y-6">
          <header className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Agenda</h1>
              <p className="text-sm text-muted-foreground">Vos événements et synchronisation Google Calendar.</p>
            </div>
          </header>

          {/* Google Calendar */}
          <section className="rounded-2xl border border-border/60 bg-card/50 p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" /> Google Calendar
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {gcalStatus?.connected
                    ? <>Connecté en tant que <span className="text-foreground font-medium">{gcalStatus.google_email}</span></>
                    : "Synchronisez vos événements avec votre compte Google."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {gcalStatus?.connected ? (
                  <>
                    <Button size="sm" variant="outline" onClick={onPullGoogle} disabled={gcalBusy}>
                      {gcalBusy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
                      Importer
                    </Button>
                    <Button size="sm" variant="outline" onClick={refreshGcal}>
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onDisconnectGoogle} disabled={gcalBusy}>
                      <Unlink className="w-4 h-4 mr-1.5" /> Déconnecter
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={onConnectGoogle} disabled={gcalBusy}>
                    <Link2 className="w-4 h-4 mr-1.5" /> Connecter Google
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* Add event */}
          <section className="rounded-2xl border border-border/60 bg-card/50 p-5">
            <h2 className="text-base font-semibold mb-3">Nouvel événement</h2>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] gap-2">
              <Input
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                placeholder="Titre (ex : Yoga)"
              />
              <Input
                type="datetime-local"
                value={newEvent.start_iso}
                onChange={(e) => setNewEvent({ ...newEvent, start_iso: e.target.value })}
                className="md:w-56"
              />
              <Input
                value={newEvent.location}
                onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                placeholder="Lieu (optionnel)"
              />
              <Button onClick={addEvent}><Plus className="w-4 h-4 mr-1" /> Ajouter</Button>
            </div>
          </section>

          {/* List events */}
          <section className="rounded-2xl border border-border/60 bg-card/50 p-5">
            <h2 className="text-base font-semibold mb-3">Prochains événements ({events.length})</h2>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : events.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                Aucun événement à venir.
              </div>
            ) : (
              <ul className="space-y-2">
                {events.map((e) => {
                  const d = new Date(e.start_iso);
                  const synced = !!e.google_event_id;
                  return (
                    <li key={e.id} className="group flex items-start gap-3 px-3 py-2.5 rounded-lg bg-secondary/40 hover:bg-secondary/60 border border-border/40 transition">
                      <div className="text-center min-w-[60px]">
                        <div className="text-xs uppercase text-muted-foreground">{d.toLocaleString("fr-FR", { month: "short" })}</div>
                        <div className="text-xl font-semibold">{d.getDate()}</div>
                        <div className="text-[11px] text-muted-foreground">{d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{e.title}</div>
                        {e.location && <div className="text-xs text-muted-foreground truncate">📍 {e.location}</div>}
                        {e.notes && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{e.notes}</div>}
                        <div className="flex items-center gap-2 mt-1">
                          {synced && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-400/20">
                              ↻ Google
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">{e.source}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        {gcalStatus?.connected && !synced && (
                          <button
                            onClick={() => onPushOne(e.id)}
                            className="p-1.5 rounded hover:bg-primary/15 text-primary"
                            title="Envoyer vers Google"
                          >
                            <Upload className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteEvent(e.id)}
                          className="p-1.5 rounded hover:bg-destructive/15 text-destructive"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}