import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveGridLayout,
  useContainerWidth,
} from "react-grid-layout/react";
import type { LayoutItem, Layout, ResponsiveLayouts } from "react-grid-layout/react";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutGrid, Lock, Plus, RotateCcw, Save } from "lucide-react";
import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import { HudHeading } from "@/components/hud/HudHeading";
import { HudWidgetShell } from "@/components/hud/HudWidgetShell";
import { WIDGET_LIST, WIDGET_REGISTRY } from "@/components/hud/widgets/registry";
import type { WidgetKind } from "@/components/hud/widgets/types";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const STORAGE_KEY = "nex.cockpit.layout.v1";
const COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
const ROW_HEIGHT = 60;

interface CockpitState {
  widgets: { id: string; kind: WidgetKind }[];
  layouts: ResponsiveLayouts;
}

function defaultState(): CockpitState {
  const widgets: CockpitState["widgets"] = [
    { id: "w-welcome", kind: "welcome" },
    { id: "w-clock", kind: "clock" },
    { id: "w-voice", kind: "voiceQuota" },
    { id: "w-system", kind: "systemStatus" },
    { id: "w-shortcuts", kind: "shortcuts" },
    { id: "w-news", kind: "news" },
    { id: "w-stocks", kind: "stocks" },
  ];
  const lg: LayoutItem[] = [
    { i: "w-welcome", x: 0, y: 0, w: 5, h: 3 },
    { i: "w-clock", x: 5, y: 0, w: 4, h: 3 },
    { i: "w-voice", x: 9, y: 0, w: 3, h: 5 },
    { i: "w-system", x: 0, y: 3, w: 5, h: 3 },
    { i: "w-shortcuts", x: 5, y: 3, w: 4, h: 3 },
    { i: "w-news", x: 0, y: 6, w: 6, h: 5 },
    { i: "w-stocks", x: 6, y: 5, w: 6, h: 6 },
  ];
  const stack = (cols: number): LayoutItem[] =>
    widgets.map((w, i) => ({
      i: w.id, x: 0, y: i * 3, w: cols,
      h: WIDGET_REGISTRY[w.kind].defaultH,
    }));
  return {
    widgets,
    layouts: { lg, md: stack(10), sm: stack(6), xs: stack(4), xxs: stack(2) },
  };
}

function loadState(): CockpitState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as CockpitState;
    parsed.widgets = (parsed.widgets ?? []).filter((w) => WIDGET_REGISTRY[w.kind]);
    return parsed;
  } catch {
    return defaultState();
  }
}

export default function Cockpit() {
  const [state, setState] = useState<CockpitState>(() => loadState());
  const [editMode, setEditMode] = useState(false);
  const [showAdder, setShowAdder] = useState(false);
  const { width, containerRef, mounted } = useContainerWidth();

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota */ }
  }, [state]);

  const onLayoutChange = useCallback(
    (_current: Layout, allLayouts: ResponsiveLayouts) => {
      setState((s) => ({ ...s, layouts: allLayouts }));
    },
    [],
  );

  const removeWidget = useCallback((id: string) => {
    setState((s) => {
      const widgets = s.widgets.filter((w) => w.id !== id);
      const layouts = Object.fromEntries(
        Object.entries(s.layouts).map(([bp, items]) => [
          bp,
          (items as readonly LayoutItem[]).filter((it) => it.i !== id),
        ]),
      ) as unknown as ResponsiveLayouts;
      return { widgets, layouts };
    });
    toast.success("Module retiré");
  }, []);

  const addWidget = useCallback((kind: WidgetKind) => {
    const meta = WIDGET_REGISTRY[kind];
    const id = `w-${kind}-${Date.now().toString(36)}`;
    setState((s) => {
      const lg = ((s.layouts as Record<string, readonly LayoutItem[]>).lg ?? []);
      const nextY = lg.reduce((acc, it) => Math.max(acc, it.y + it.h), 0);
      const newItem: LayoutItem = {
        i: id, x: 0, y: nextY, w: meta.defaultW, h: meta.defaultH,
        minW: meta.minW, minH: meta.minH,
      };
      const layouts = { ...s.layouts, lg: [...lg, newItem] } as ResponsiveLayouts;
      return { widgets: [...s.widgets, { id, kind }], layouts };
    });
    setShowAdder(false);
    toast.success(`${meta.title} ajouté`);
  }, []);

  const resetLayout = useCallback(() => {
    setState(defaultState());
    toast.info("Disposition réinitialisée");
  }, []);

  const saveLayout = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      toast.success("Disposition sauvegardée");
    } catch {
      toast.error("Sauvegarde impossible (stockage plein)");
    }
  }, [state]);

  const renderedWidgets = useMemo(() => state.widgets.map((w) => {
    const meta = WIDGET_REGISTRY[w.kind];
    if (!meta) return null;
    const Comp = meta.Component;
    return (
      <div key={w.id}>
        <HudWidgetShell
          title={meta.title}
          code={w.id.slice(2, 8).toUpperCase()}
          editMode={editMode}
          onRemove={() => removeWidget(w.id)}
        >
          <Comp />
        </HudWidgetShell>
      </div>
    );
  }), [state.widgets, editMode, removeWidget]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <Header />
      <main className="ml-0 md:[margin-left:var(--sidebar-w,280px)] md:transition-[margin-left] md:duration-300 pt-14 min-h-screen">
        <div className="px-3 md:px-6 py-4">
          <HudHeading
            title="Cockpit"
            subtitle="// Tableau de bord modulaire — glisse, redimensionne, ajoute."
            code="CPT-01"
            icon={<LayoutGrid className="w-5 h-5" />}
            right={
              <>
                <Button
                  variant={editMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEditMode((v) => !v)}
                  className="gap-2"
                >
                  {editMode ? <Lock className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                  {editMode ? "Verrouiller" : "Éditer"}
                </Button>
                {editMode && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setShowAdder((v) => !v)} className="gap-2">
                      <Plus className="w-4 h-4" /> Ajouter
                    </Button>
                    <Button variant="outline" size="sm" onClick={saveLayout} className="gap-2">
                      <Save className="w-4 h-4" /> Sauver
                    </Button>
                    <Button variant="ghost" size="sm" onClick={resetLayout} className="gap-2">
                      <RotateCcw className="w-4 h-4" /> Reset
                    </Button>
                  </>
                )}
              </>
            }
          />
        </div>

        <AnimatePresence>
          {editMode && showAdder && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="mx-3 md:mx-6 mb-4 p-4 rounded-sm border border-primary/40 bg-card/60 backdrop-blur-md shadow-[0_0_22px_hsl(var(--primary)/0.25)]"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary/80 mb-3">
                // Catalogue de modules
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {WIDGET_LIST.map((meta) => (
                  <button
                    key={meta.kind}
                    onClick={() => addWidget(meta.kind)}
                    className="text-left p-3 rounded-sm border border-primary/30 hover:border-primary hover:bg-primary/10 transition group"
                  >
                    <div className="font-display text-xs font-bold uppercase tracking-[0.14em] text-neon">
                      {meta.title}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {meta.description}
                    </div>
                    <div className="mt-2 font-mono text-[9px] uppercase tracking-wider text-primary/60 opacity-0 group-hover:opacity-100 transition">
                      + ajouter
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={containerRef} className={`px-3 md:px-6 pb-24 ${editMode ? "cockpit-edit" : ""}`}>
          {mounted && (
            <ResponsiveGridLayout
              className="layout"
              width={width}
              layouts={state.layouts}
              breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
              cols={COLS}
              rowHeight={ROW_HEIGHT}
              margin={[12, 12]}
              dragConfig={{ enabled: editMode, handle: ".widget-drag-handle" }}
              resizeConfig={{ enabled: editMode }}
              onLayoutChange={onLayoutChange}
            >
              {renderedWidgets}
            </ResponsiveGridLayout>
          )}
        </div>
      </main>
    </div>
  );
}