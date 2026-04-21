import { useEffect, useRef, useState } from "react";
import { Calendar, MapPin, Clock, Trash2, Plus } from "lucide-react";
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
  added?: AddedSpec;          // si présent, ce widget vient d'un add_schedule_event
  removed_count?: number;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

function groupByDay(events: ScheduleEvent[]): Record<string, ScheduleEvent[]> {
  const out: Record<string, ScheduleEvent[]> = {};
  for (const e of events) {
    const key = new Date(e.start_iso).toDateString();
    (out[key] ||= []).push(e);
  }
  return out;
}

export function ScheduleWidget({
  range_label,
  range_start_iso,
  range_end_iso,
  added,
  removed_count,
}: Props) {
  const did = useRef(false);
  const [events, setEvents] = useState<ScheduleEvent[]>(() => scheduleService.getAll());

  // If the AI passed an "added" spec, persist it on first render.
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
  }, [added]);

  useEffect(() => scheduleService.subscribe(setEvents), []);

  const from = range_start_iso ? Date.parse(range_start_iso) : null;
  const to = range_end_iso ? Date.parse(range_end_iso) : null;
  const filtered = (from !== null && to !== null && !isNaN(from) && !isNaN(to))
    ? events.filter((e) => {
        const t = Date.parse(e.start_iso);
        return !isNaN(t) && t >= from && t < to;
      })
    : events;

  const grouped = groupByDay(filtered);
  const dayKeys = Object.keys(grouped);

  const headerLabel =
    added ? "ÉVÉNEMENT AJOUTÉ" :
    typeof removed_count === "number" ? "ÉVÉNEMENT(S) SUPPRIMÉ(S)" :
    `EMPLOI DU TEMPS${range_label ? ` · ${range_label.toUpperCase()}` : ""}`;

  return (
    <div className="rounded-xl border border-violet-500/40 bg-gradient-to-br from-violet-900/25 to-fuchsia-900/15 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-3">
        {added ? <Plus className="w-3.5 h-3.5 text-violet-300" /> :
          typeof removed_count === "number" ? <Trash2 className="w-3.5 h-3.5 text-pink-300" /> :
          <Calendar className="w-3.5 h-3.5 text-violet-300" />}
        {headerLabel}
      </div>

      {/* Confirmation banner */}
      {added && (
        <div className="mb-3 rounded-lg bg-violet-500/15 border border-violet-400/30 p-3">
          <p className="text-sm font-semibold text-foreground">{added.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            📅 {fmtDay(added.start_iso)} · ⏰ {fmtTime(added.start_iso)}
            {added.end_iso ? ` → ${fmtTime(added.end_iso)}` : ""}
          </p>
          {added.location && (
            <p className="text-xs text-violet-200/80 mt-0.5 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {added.location}
            </p>
          )}
          {added.notes && <p className="text-xs text-muted-foreground mt-1">{added.notes}</p>}
        </div>
      )}

      {typeof removed_count === "number" && (
        <p className="mb-3 text-sm text-pink-200">
          {removed_count > 0
            ? `${removed_count} événement${removed_count > 1 ? "s" : ""} supprimé${removed_count > 1 ? "s" : ""}.`
            : "Aucun événement correspondant trouvé."}
        </p>
      )}

      {/* Listing */}
      {dayKeys.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Aucun événement {range_label ? `pour ${range_label.toLowerCase()}` : "enregistré"}.</p>
      ) : (
        <div className="space-y-3">
          {dayKeys.map((dayKey) => (
            <div key={dayKey}>
              <p className="text-[11px] uppercase tracking-wide text-violet-300/80 mb-1.5">
                {new Date(dayKey).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
              </p>
              <ul className="space-y-1.5">
                {grouped[dayKey].map((e) => (
                  <li
                    key={e.id}
                    className="group flex items-start gap-3 rounded-lg bg-background/40 border border-border/30 px-3 py-2"
                  >
                    <div className="text-[11px] font-mono text-violet-200 shrink-0 w-12 text-right pt-0.5">
                      {fmtTime(e.start_iso)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{e.title}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                        {e.end_iso && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> jusqu'à {fmtTime(e.end_iso)}
                          </span>
                        )}
                        {e.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {e.location}
                          </span>
                        )}
                      </div>
                      {e.notes && <p className="text-xs text-muted-foreground/80 mt-0.5 line-clamp-2">{e.notes}</p>}
                    </div>
                    <button
                      onClick={() => scheduleService.remove(e.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-pink-300 transition-opacity p-1"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
