import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, MapPin, Trash2, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { scheduleService, ScheduleEvent } from "@/services/scheduleService";

interface AddedSpec {
  title: string;
  start_iso: string;
  end_iso?: string;
  location?: string;
  notes?: string;
}

interface Props {
  range_label?: string;       // ex: "Aujourd'hui", "Cette semaine"
  range_start_iso?: string;
  range_end_iso?: string;
  added?: AddedSpec;
  remove_query?: string;
}

const DAY_MS = 86_400_000;
const HOUR_PX = 32;             // height of one hour row (compact)
const START_HOUR = 8;           // grid starts at 08:00
const END_HOUR = 22;            // grid ends at 22:00 (exclusive)
const TOTAL_HOURS = END_HOUR - START_HOUR;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // monday = 0
  x.setDate(x.getDate() - dow);
  return x;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDayLong(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

/** Hash → stable hue for an event color, keeps the violet/fuchsia palette flavor. */
function hueFor(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  // Bias toward violet/pink/blue spectrum
  return 240 + (h % 90); // 240..329
}

interface PositionedEvent {
  ev: ScheduleEvent;
  topPx: number;
  heightPx: number;
}

function position(ev: ScheduleEvent, dayStart: Date): PositionedEvent | null {
  const s = new Date(ev.start_iso);
  if (isNaN(s.getTime())) return null;
  const e = ev.end_iso ? new Date(ev.end_iso) : new Date(s.getTime() + 60 * 60 * 1000);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  if (e <= dayStart || s >= dayEnd) return null;
  const clampStart = s < dayStart ? dayStart : s;
  const clampEnd = e > dayEnd ? dayEnd : e;
  const startMin = (clampStart.getHours() - START_HOUR) * 60 + clampStart.getMinutes();
  const endMin = (clampEnd.getHours() - START_HOUR) * 60 + clampEnd.getMinutes();
  const topPx = (startMin / 60) * HOUR_PX;
  const heightPx = Math.max(22, ((endMin - startMin) / 60) * HOUR_PX);
  return { ev, topPx, heightPx };
}

export function ScheduleWidget({
  range_label,
  range_start_iso,
  range_end_iso,
  added,
  remove_query,
}: Props) {
  const did = useRef(false);
  const [events, setEvents] = useState<ScheduleEvent[]>(() => scheduleService.getAll());
  const [removedCount, setRemovedCount] = useState<number | null>(null);

  // initial range type drives default view: "day" if range = today/tomorrow, else "week"
  const initialView: "day" | "week" =
    (range_start_iso && range_end_iso &&
      Date.parse(range_end_iso) - Date.parse(range_start_iso) <= DAY_MS + 1000)
      ? "day" : "week";
  const [view, setView] = useState<"day" | "week">(initialView);

  // The "anchor" date the user is browsing
  const initialAnchor = useMemo(() => {
    if (range_start_iso) {
      const d = new Date(range_start_iso);
      if (!isNaN(d.getTime())) return d;
    }
    if (added?.start_iso) {
      const d = new Date(added.start_iso);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }, [range_start_iso, added?.start_iso]);
  const [anchor, setAnchor] = useState<Date>(initialAnchor);

  // Persist add / remove on first render
  useEffect(() => {
    if (did.current) return;
    did.current = true;
    if (added && added.title && added.start_iso) {
      const exists = scheduleService.getAll().some(
        (e) => e.title === added.title && e.start_iso === added.start_iso
      );
      if (!exists) {
        scheduleService.add({
          title: added.title,
          start_iso: added.start_iso,
          end_iso: added.end_iso,
          location: added.location,
          notes: added.notes,
        });
      }
    }
    if (remove_query && remove_query.trim()) {
      const n = scheduleService.removeByTitle(remove_query.trim());
      setRemovedCount(n);
    }
  }, [added, remove_query]);

  useEffect(() => scheduleService.subscribe(setEvents), []);

  // Days currently displayed
  const days = useMemo<Date[]>(() => {
    if (view === "day") return [startOfDay(anchor)];
    const wk = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => new Date(wk.getTime() + i * DAY_MS));
  }, [view, anchor]);

  const today = startOfDay(new Date()).getTime();

  const goPrev = () => {
    const next = new Date(anchor);
    if (view === "day") next.setDate(next.getDate() - 1);
    else next.setDate(next.getDate() - 7);
    setAnchor(next);
  };
  const goNext = () => {
    const next = new Date(anchor);
    if (view === "day") next.setDate(next.getDate() + 1);
    else next.setDate(next.getDate() + 7);
    setAnchor(next);
  };
  const goToday = () => setAnchor(new Date());

  const headerLabel = added
    ? "ÉVÉNEMENT AJOUTÉ"
    : remove_query
      ? "ÉVÉNEMENT(S) SUPPRIMÉ(S)"
      : `EMPLOI DU TEMPS${range_label ? ` · ${range_label.toUpperCase()}` : ""}`;

  const periodLabel =
    view === "day"
      ? days[0].toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })
      : `${days[0].toLocaleDateString([], { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="rounded-xl border border-cyan-500/40 bg-gradient-to-br from-teal-900/25 to-teal-900/15 p-4 md:p-5 w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          {added ? <Plus className="w-3.5 h-3.5 text-cyan-300" /> :
            remove_query ? <Trash2 className="w-3.5 h-3.5 text-pink-300" /> :
            <Calendar className="w-3.5 h-3.5 text-cyan-300" />}
          {headerLabel}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setView("day")}
            className={`px-2 py-1 rounded-md text-[11px] transition-colors ${view === "day" ? "bg-cyan-500/30 text-foreground" : "text-muted-foreground hover:bg-white/5"}`}
          >Jour</button>
          <button
            onClick={() => setView("week")}
            className={`px-2 py-1 rounded-md text-[11px] transition-colors ${view === "week" ? "bg-cyan-500/30 text-foreground" : "text-muted-foreground hover:bg-white/5"}`}
          >Semaine</button>
        </div>
      </div>

      {/* Confirmation banners */}
      {added && (
        <div className="mb-3 rounded-lg bg-cyan-500/15 border border-cyan-400/30 p-3">
          <p className="text-sm font-semibold text-foreground">{added.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            📅 {fmtDayLong(added.start_iso)} · ⏰ {fmtTime(added.start_iso)}
            {added.end_iso ? ` → ${fmtTime(added.end_iso)}` : ""}
          </p>
          {added.location && (
            <p className="text-xs text-cyan-200/80 mt-0.5 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {added.location}
            </p>
          )}
          {added.notes && <p className="text-xs text-muted-foreground mt-1">{added.notes}</p>}
        </div>
      )}
      {remove_query && removedCount !== null && (
        <p className="mb-3 text-sm text-pink-200">
          {removedCount > 0
            ? `${removedCount} événement${removedCount > 1 ? "s" : ""} supprimé${removedCount > 1 ? "s" : ""} (correspondant à « ${remove_query} »).`
            : `Aucun événement correspondant à « ${remove_query} » trouvé.`}
        </p>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <button onClick={goPrev} className="p-1 rounded-md hover:bg-white/10 text-muted-foreground" title="Précédent">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={goNext} className="p-1 rounded-md hover:bg-white/10 text-muted-foreground" title="Suivant">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={goToday}
            className="ml-1 px-2 py-1 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-muted-foreground"
          >
            Aujourd'hui
          </button>
        </div>
        <p className="text-xs font-medium text-foreground capitalize">{periodLabel}</p>
      </div>

      {/* Grid */}
      <div className="rounded-lg border border-border/30 bg-background/30 overflow-hidden">
        {/* Day headers */}
        <div className="grid border-b border-border/30 bg-background/40" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div />
          {days.map((d) => {
            const isToday = startOfDay(d).getTime() === today;
            return (
              <div key={d.toISOString()} className="px-2 py-2 text-center border-l border-border/30">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {d.toLocaleDateString([], { weekday: "short" })}
                </p>
                <p className={`text-base font-semibold ${isToday ? "text-cyan-300" : "text-foreground"}`}>
                  {d.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))`,
            height: `${TOTAL_HOURS * HOUR_PX}px`,
          }}
        >
          {/* Hour labels column */}
          <div className="relative border-r border-border/30">
            {Array.from({ length: TOTAL_HOURS }, (_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 text-[11px] text-muted-foreground/80 px-1.5 text-right"
                style={{ top: `${i * HOUR_PX}px`, height: `${HOUR_PX}px` }}
              >
                {String(START_HOUR + i).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d, dayIdx) => {
            const dStart = startOfDay(d);
            const dayEvents = events
              .map((ev) => position(ev, dStart))
              .filter((p): p is PositionedEvent => p !== null)
              .sort((a, b) => a.topPx - b.topPx);
            const isToday = dStart.getTime() === today;
            const nowMin = isToday ? (new Date().getHours() - START_HOUR) * 60 + new Date().getMinutes() : -1;
            const nowTop = nowMin >= 0 && nowMin <= TOTAL_HOURS * 60 ? (nowMin / 60) * HOUR_PX : -1;

            return (
              <div key={dayIdx} className="relative border-l border-border/30">
                {/* Hour lines */}
                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-border/15"
                    style={{ top: `${i * HOUR_PX}px` }}
                  />
                ))}
                {/* Today highlight */}
                {isToday && (
                  <div className="absolute inset-0 bg-cyan-500/[0.04] pointer-events-none" />
                )}
                {/* Now line */}
                {nowTop >= 0 && (
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none"
                    style={{ top: `${nowTop}px` }}
                  >
                    <div className="h-px bg-teal-400 shadow-[0_0_8px_rgba(232,121,249,0.6)]" />
                    <div className="absolute -left-1 -top-[3px] w-1.5 h-1.5 rounded-full bg-teal-400" />
                  </div>
                )}
                {/* Events */}
                {dayEvents.map(({ ev, topPx, heightPx }) => {
                  const hue = hueFor(ev.title);
                  return (
                    <button
                      key={ev.id}
                      onClick={() => {
                        if (confirm(`Supprimer "${ev.title}" ?`)) scheduleService.remove(ev.id);
                      }}
                      className="absolute left-1 right-1 rounded-md px-1.5 py-1 text-left overflow-hidden border transition-all hover:brightness-125 group"
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        background: `hsl(${hue} 70% 30% / 0.55)`,
                        borderColor: `hsl(${hue} 80% 60% / 0.5)`,
                        boxShadow: `0 2px 8px hsl(${hue} 80% 30% / 0.4)`,
                      }}
                      title={`${ev.title} — ${fmtTime(ev.start_iso)}${ev.end_iso ? ` → ${fmtTime(ev.end_iso)}` : ""}${ev.location ? `\n📍 ${ev.location}` : ""}${ev.notes ? `\n📝 ${ev.notes}` : ""}`}
                    >
                      <p className="text-[11px] font-semibold text-white leading-tight line-clamp-2">{ev.title}</p>
                      {heightPx > 32 && (
                        <p className="text-[9px] text-white/80 mt-0.5">
                          {fmtTime(ev.start_iso)}
                          {ev.end_iso ? ` – ${fmtTime(ev.end_iso)}` : ""}
                        </p>
                      )}
                      {heightPx > 56 && ev.location && (
                        <p className="text-[9px] text-white/70 mt-0.5 flex items-center gap-0.5">
                          <MapPin className="w-2.5 h-2.5" /> {ev.location}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/60 mt-2">
        Astuce : clique sur un événement pour le supprimer. Les événements sont gardés en mémoire locale (non synchronisés).
      </p>
    </div>
  );
}
