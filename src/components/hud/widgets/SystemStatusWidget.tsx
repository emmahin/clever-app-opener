import { useEffect, useState } from "react";
import { HudStat } from "@/components/hud/HudStat";

/**
 * Widget "santé système" : indicateurs animés (FPS, latence, mémoire estimée,
 * connectivité). Valeurs réelles quand dispo (perf API, navigator), sinon mock animé.
 */
export function SystemStatusWidget() {
  const [fps, setFps] = useState(60);
  const [ping, setPing] = useState(42);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    const tick = (t: number) => {
      frames++;
      if (t - last >= 1000) {
        setFps(Math.round((frames * 1000) / (t - last)));
        frames = 0;
        last = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onChange = () => setOnline(navigator.onLine);
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  }, []);

  // Mesure ping toutes les 10s sur la racine
  useEffect(() => {
    let cancelled = false;
    const measure = async () => {
      const start = performance.now();
      try {
        await fetch("/manifest.webmanifest", { cache: "no-store" });
        if (!cancelled) setPing(Math.round(performance.now() - start));
      } catch { /* ignore */ }
    };
    measure();
    const id = window.setInterval(measure, 10_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  // Mémoire JS si dispo
  const mem =
    (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  const memMb = mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : null;
  const memPct = mem ? (mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100 : 0;

  return (
    <div className="h-full grid grid-cols-2 gap-2 content-center">
      <HudStat label="FPS" value={fps} unit="hz" progress={Math.min(100, (fps / 60) * 100)} />
      <HudStat
        label="LATENCE"
        value={ping}
        unit="ms"
        delta={{ value: ping < 100 ? "OK" : "HIGH", positive: ping < 100 }}
      />
      <HudStat
        label="RÉSEAU"
        value={online ? "ONLINE" : "OFFLINE"}
        delta={{ value: online ? "STABLE" : "DOWN", positive: online }}
      />
      {memMb !== null ? (
        <HudStat label="MÉMOIRE" value={memMb} unit="mb" progress={memPct} />
      ) : (
        <HudStat label="CORE" value="OK" delta={{ value: "STABLE", positive: true }} />
      )}
    </div>
  );
}