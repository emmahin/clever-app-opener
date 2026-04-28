import { useEffect, useState } from "react";
import { fetchElevenLabsUsage, type ElevenLabsUsage } from "@/services/elevenLabsUsageService";
import { HudGauge } from "@/components/hud/HudGauge";
import { HudLoader } from "@/components/hud/HudLoader";

export function VoiceQuotaWidget() {
  const [data, setData] = useState<ElevenLabsUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const u = await fetchElevenLabsUsage();
        if (!cancelled) { setData(u); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "ERR");
      }
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-center font-mono text-[10px] uppercase tracking-wider text-destructive">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="h-full flex items-center justify-center">
        <HudLoader size={70} label="SCAN" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-1">
      <HudGauge value={data.percent_used} unit="%" label="QUOTA UTILISÉ" size={130} />
      <div className="font-mono text-[10px] uppercase tracking-wider text-primary/80 text-center">
        {data.character_count.toLocaleString()} /{" "}
        {data.character_limit.toLocaleString()} car.
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        plan · {data.tier}
      </div>
    </div>
  );
}