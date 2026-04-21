/**
 * User schedule (emploi du temps) — localStorage based.
 * Events the AI can read/write via tools.
 */

export interface ScheduleEvent {
  id: string;
  title: string;
  start_iso: string;     // ISO 8601 start
  end_iso?: string;      // optional end
  location?: string;
  notes?: string;
  createdAt: number;
}

const LS_KEY = "app_schedule_events";
type Listener = (events: ScheduleEvent[]) => void;

function loadAll(): ScheduleEvent[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveAll(list: ScheduleEvent[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
}

class ScheduleService {
  private list: ScheduleEvent[] = loadAll();
  private listeners = new Set<Listener>();

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (e.key === LS_KEY) {
          this.list = loadAll();
          this.emit();
        }
      });
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
    saveAll(this.list);
    this.emit();
    return ev;
  }

  remove(id: string) {
    this.list = this.list.filter((e) => e.id !== id);
    saveAll(this.list);
    this.emit();
  }

  /** Remove by fuzzy title match (case-insensitive contains). Returns deleted count. */
  removeByTitle(query: string): number {
    const q = query.trim().toLowerCase();
    if (!q) return 0;
    const before = this.list.length;
    this.list = this.list.filter((e) => !e.title.toLowerCase().includes(q));
    saveAll(this.list);
    this.emit();
    return before - this.list.length;
  }

  clearAll() {
    this.list = [];
    saveAll(this.list);
    this.emit();
  }
}

export const scheduleService = new ScheduleService();
