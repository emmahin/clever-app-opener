import { useEffect, useRef, useState } from "react";
import { Globe, Check } from "lucide-react";
import { LANGS, useLanguage } from "@/i18n/LanguageProvider";

export function LanguageSelector() {
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGS.find((l) => l.code === lang)!;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={t("language")}
        className="h-9 px-2.5 rounded-lg bg-white/15 hover:bg-white/25 flex items-center gap-2 text-white text-sm font-medium transition-colors border border-white/20"
      >
        <Globe className="w-4 h-4" />
        <span className="text-base leading-none">{current.flag}</span>
        <span className="hidden md:inline uppercase text-xs">{current.code}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-xl border border-border/60 bg-popover text-popover-foreground shadow-2xl z-50 overflow-hidden">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLang(l.code);
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
            >
              <span className="text-base">{l.flag}</span>
              <span className="flex-1">{l.label}</span>
              {l.code === lang && <Check className="w-4 h-4 opacity-70" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
