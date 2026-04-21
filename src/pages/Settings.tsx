import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import { useSettings, DetailLevel } from "@/contexts/SettingsProvider";
import { useLanguage, LANGS, Lang } from "@/i18n/LanguageProvider";
import { Settings as SettingsIcon, Globe, Sparkles, MessageSquare, Trash2, RotateCcw, Check, Bell } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useNotificationPrefs } from "@/hooks/useNotifications";
import { NotificationType } from "@/services/notificationService";

export default function Settings() {
  const { settings, update, reset } = useSettings();
  const { lang, setLang, t } = useLanguage();
  const [draftInstructions, setDraftInstructions] = useState(settings.customInstructions);
  const { prefs: notifPrefs, update: updateNotif } = useNotificationPrefs();

  const saveCustom = () => {
    update("customInstructions", draftInstructions);
    toast.success(t("settingsSaved"));
  };

  const clearCaches = () => {
    localStorage.removeItem("translations.cache.v1");
    toast.success(t("cacheCleared"));
  };

  const detailOptions: { value: DetailLevel; labelKey: "short" | "normal" | "detailed" }[] = [
    { value: "short", labelKey: "short" },
    { value: "normal", labelKey: "normal" },
    { value: "detailed", labelKey: "detailed" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <Header />
      <main className="ml-[72px] pt-14 min-h-screen">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          <header className="flex items-center gap-3">
            <SettingsIcon className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold">{t("settings")}</h1>
              <p className="text-sm text-muted-foreground">{t("settingsSubtitle")}</p>
            </div>
          </header>

          {/* Langue */}
          <Section icon={<Globe className="w-5 h-5" />} title={t("language")} description={t("languageDesc")}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {LANGS.map((l) => {
                const active = l.code === lang;
                return (
                  <button
                    key={l.code}
                    onClick={() => setLang(l.code as Lang)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all ${
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border/60 bg-secondary/40 hover:bg-secondary text-muted-foreground"
                    }`}
                  >
                    <span className="text-lg">{l.flag}</span>
                    <span className="flex-1 text-left">{l.label}</span>
                    {active && <Check className="w-4 h-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* IA & comportement */}
          <Section icon={<Sparkles className="w-5 h-5" />} title={t("aiBehavior")} description={t("aiBehaviorDesc")}>
            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium block mb-2">{t("detailLevel")}</label>
                <div className="grid grid-cols-3 gap-2">
                  {detailOptions.map((o) => {
                    const active = settings.detailLevel === o.value;
                    return (
                      <button
                        key={o.value}
                        onClick={() => update("detailLevel", o.value)}
                        className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                          active
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border/60 bg-secondary/40 hover:bg-secondary text-muted-foreground"
                        }`}
                      >
                        {t(o.labelKey)}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">{t("detailLevelHint")}</p>
              </div>

              <ToggleRow
                label={t("typewriter")}
                description={t("typewriterHint")}
                checked={settings.typewriter}
                onChange={(v) => update("typewriter", v)}
              />
            </div>
          </Section>

          {/* Personnalisation */}
          <Section
            icon={<MessageSquare className="w-5 h-5" />}
            title={t("personalization")}
            description={t("personalizationDesc")}
          >
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">{t("customInstructions")}</label>
                <textarea
                  value={draftInstructions}
                  onChange={(e) => setDraftInstructions(e.target.value)}
                  maxLength={2000}
                  rows={6}
                  placeholder={t("customInstructionsPlaceholder")}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/40 border border-border/60 text-sm resize-y focus:outline-none focus:border-primary"
                />
                <div className="flex justify-between mt-1.5">
                  <p className="text-xs text-muted-foreground">{t("customInstructionsHint")}</p>
                  <span className="text-xs text-muted-foreground">{draftInstructions.length}/2000</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveCustom}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  {t("save")}
                </button>
                <button
                  onClick={() => {
                    setDraftInstructions(settings.customInstructions);
                  }}
                  className="px-4 py-2 rounded-lg bg-secondary text-sm hover:bg-secondary/80 transition-colors"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          </Section>

          {/* Notifications */}
          <Section
            icon={<Bell className="w-5 h-5" />}
            title="Notifications"
            description="Gère ce que tu reçois et quand."
          >
            <div className="space-y-5">
              <ToggleRow
                label="Activer les notifications"
                description="Désactive pour couper toasts + cloche."
                checked={notifPrefs.enabled}
                onChange={(v) => updateNotif({ enabled: v })}
              />
              <ToggleRow
                label="Ne pas déranger"
                description="Garde l'historique mais bloque toasts et sons."
                checked={notifPrefs.doNotDisturb}
                onChange={(v) => updateNotif({ doNotDisturb: v })}
              />

              <div>
                <label className="text-sm font-medium block mb-2">Heures silencieuses</label>
                <div className="mb-3">
                  <ToggleRow
                    label="Activer les heures silencieuses"
                    description="Quand actif, aucun toast dans la plage choisie. La cloche reste mise à jour."
                    checked={notifPrefs.quietHoursEnabled}
                    onChange={(v) => updateNotif({ quietHoursEnabled: v })}
                  />
                </div>
                <div className={`flex items-center gap-3 text-sm ${notifPrefs.quietHoursEnabled ? "" : "opacity-50 pointer-events-none"}`}>
                  <span className="text-muted-foreground">De</span>
                  <select
                    value={notifPrefs.quietStartHour}
                    onChange={(e) => updateNotif({ quietStartHour: parseInt(e.target.value, 10) })}
                    className="px-2 py-1.5 rounded-lg bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-primary"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, "0")}h</option>
                    ))}
                  </select>
                  <span className="text-muted-foreground">à</span>
                  <select
                    value={notifPrefs.quietEndHour}
                    onChange={(e) => updateNotif({ quietEndHour: parseInt(e.target.value, 10) })}
                    className="px-2 py-1.5 rounded-lg bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-primary"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, "0")}h</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">Désactivé par défaut. Active si tu veux du calme la nuit.</p>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Catégories</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    ["chat_response", "Réponses IA"],
                    ["whatsapp_message", "Messages WhatsApp"],
                    ["news", "Actualités"],
                    ["stock_alert", "Alertes boursières"],
                    ["reminder", "Rappels"],
                    ["ai_insight", "Insights IA"],
                    ["system", "Système"],
                  ] as Array<[NotificationType, string]>).map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-secondary/40 border border-border/60 cursor-pointer hover:bg-secondary/60 transition-colors">
                      <span className="text-sm">{label}</span>
                      <input
                        type="checkbox"
                        checked={notifPrefs.byType[key]}
                        onChange={(e) => updateNotif({ byType: { ...notifPrefs.byType, [key]: e.target.checked } })}
                        className="accent-primary w-4 h-4"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Seuil d'alerte boursière : <span className="text-primary">±{notifPrefs.stockAlertThreshold}%</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={15}
                  step={1}
                  value={notifPrefs.stockAlertThreshold}
                  onChange={(e) => updateNotif({ stockAlertThreshold: parseInt(e.target.value, 10) })}
                  className="w-full accent-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">Tu reçois une alerte si une valeur de ta watchlist bouge de ce pourcentage.</p>
              </div>
            </div>
          </Section>

          {/* Confidentialité */}
          <Section
            icon={<Trash2 className="w-5 h-5" />}
            title={t("privacy")}
            description={t("privacyDesc")}
          >
            <div className="flex flex-wrap gap-2">
              <button
                onClick={clearCaches}
                className="px-4 py-2 rounded-lg bg-secondary text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {t("clearCache")}
              </button>
              <button
                onClick={() => {
                  reset();
                  toast.success(t("settingsReset"));
                }}
                className="px-4 py-2 rounded-lg bg-secondary text-sm hover:bg-secondary/80 transition-colors flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                {t("resetSettings")}
              </button>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
          checked ? "bg-primary" : "bg-secondary"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
