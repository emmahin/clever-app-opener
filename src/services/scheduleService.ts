/**
 * User schedule (emploi du temps).
 *
 * Source de vérité : la table Supabase `schedule_events` (via twinMemoryService).
 * Ce service expose une API SYNCHRONE pour les composants UI : il garde un cache
 * en mémoire qu'il synchronise au boot, à chaque login/logout, et après chaque
 * mutation (qui est répercutée sur la DB en arrière-plan).
 *
 * Pourquoi un cache sync : les widgets existants (ScheduleWidget) appellent
 * `getAll()` et `subscribe()` de manière synchrone. Cette couche évite de tout
 * réécrire en async tout en supprimant l'ancienne source localStorage.
 */
import { supabase } from "@/integrations/supabase/client";
import { twinMemoryService } from "./twinMemoryService";

export interface ScheduleEvent {
  id: string;
  title: string;
  start_iso: string;     // ISO 8601 start
  end_iso?: string;      // optional end
  location?: string;
  notes?: string;
  createdAt: number;
}

type Listener = (events: ScheduleEvent[]) => void;

class ScheduleService {
  private list: ScheduleEvent[] = [];
  private listeners = new Set<Listener>();

  constructor() {
    if (typeof window !== "undefined") {
      // Première synchro DB.
      void this.refreshFromDB();
      // Re-synchro à chaque changement d'auth.
      supabase.auth.onAuthStateChange(() => { void this.refreshFromDB(); });
    }
  }

  /** Recharge depuis la DB et notifie les listeners. */
  private async refreshFromDB(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        this.list = [];
        this.emit();
        return;
      }
      const rows = await twinMemoryService.listEvents(60);
      this.list = rows.map((r) => ({
        id: r.id,
        title: r.title,
        start_iso: r.start_iso,
        end_iso: r.end_iso ?? undefined,
        location: r.location ?? undefined,
        notes: r.notes ?? undefined,
        createdAt: new Date(r.created_at).getTime(),
      }));
      this.emit();
    } catch (e) {
      console.warn("[scheduleService] refreshFromDB failed", e);
    }
  }

  private emit() {
    for (const l of this.listeners) l([...this.list]);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l([...this.list]);
    return () => this.listeners.delete(l);
  }

  getAll(): ScheduleEvent[] {
    return [...this.list].sort((a, b) => Date.parse(a.start_iso) - Date.parse(b.start_iso));
  }

  /** Returns events whose start is in [from, to). */
  getRange(from: number, to: number): ScheduleEvent[] {
    return this.getAll().filter((e) => {
      const t = Date.parse(e.start_iso);
      return !isNaN(t) && t >= from && t < to;
    });
  }

  add(input: Omit<ScheduleEvent, "id" | "createdAt">): ScheduleEvent {
    const ev: ScheduleEvent = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      ...input,
    };
    this.list = [...this.list, ev];
    this.emit();
    // Persiste en DB (best effort, non bloquant).
    (async () => {
      try {
        const created = await twinMemoryService.addEvent({
          title: ev.title,
          start_iso: ev.start_iso,
          end_iso: ev.end_iso,
          location: ev.location,
          notes: ev.notes,
        });
        // Remplace l'id local par l'id DB pour rester aligné.
        this.list = this.list.map((e) => (e.id === ev.id ? { ...e, id: created.id } : e));
        this.emit();
      } catch (e) {
        console.warn("[scheduleService] add: DB persist failed", e);
      }
    })();
    return ev;
  }

  remove(id: string) {
    this.list = this.list.filter((e) => e.id !== id);
    this.emit();
    (async () => {
      try { await twinMemoryService.deleteEvent(id); }
      catch (e) { console.warn("[scheduleService] remove: DB failed", e); }
    })();
  }

  /** Remove by fuzzy title match (case-insensitive contains). Returns deleted count. */
  removeByTitle(query: string): number {
    const q = query.trim().toLowerCase();
    if (!q) return 0;
    const toDelete = this.list.filter((e) => e.title.toLowerCase().includes(q));
    this.list = this.list.filter((e) => !e.title.toLowerCase().includes(q));
    this.emit();
    (async () => {
      for (const ev of toDelete) {
        try { await twinMemoryService.deleteEvent(ev.id); }
        catch (e) { console.warn("[scheduleService] removeByTitle: DB failed", e); }
      }
    })();
    return toDelete.length;
  }

  clearAll() {
    const toDelete = [...this.list];
    this.list = [];
    this.emit();
    (async () => {
      for (const ev of toDelete) {
        try { await twinMemoryService.deleteEvent(ev.id); }
        catch (e) { console.warn("[scheduleService] clearAll: DB failed", e); }
      }
    })();
  }
}

export const scheduleService = new ScheduleService();
