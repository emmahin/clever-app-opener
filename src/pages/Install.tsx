import { useEffect, useState } from "react";
import { Download, Smartphone, Monitor, Apple, Check, Share, Plus } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "android" | "ios" | "desktop" | "other";

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "other";
  const ua = window.navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua) || (ua.includes("mac") && "ontouchend" in document)) return "ios";
  if (/win|mac|linux/.test(ua)) return "desktop";
  return "other";
}

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        // @ts-expect-error iOS Safari
        window.navigator.standalone === true
    );

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  };

  if (isStandalone) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 bg-background">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Nex est déjà installé</h1>
          <p className="text-muted-foreground">Vous utilisez actuellement Nex en application installée. 🎉</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-10 md:py-16">
      <div className="max-w-2xl mx-auto">
        <header className="text-center mb-10">
          <img
            src="/icon-192.png"
            alt="Nex"
            width={96}
            height={96}
            className="w-24 h-24 rounded-3xl mx-auto mb-5 shadow-2xl"
          />
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Installer Nex</h1>
          <p className="text-muted-foreground">
            Mettez Nex sur votre écran d'accueil ou bureau, comme une vraie application — accès en un tap, plein écran, sans barre du navigateur.
          </p>
        </header>

        {/* Bouton install natif (Chrome / Edge / Android) */}
        {deferredPrompt && !installed && (
          <button
            onClick={handleInstall}
            className="w-full mb-8 py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-lg shadow-primary/30"
          >
            <Download className="w-5 h-5" />
            Installer Nex maintenant
          </button>
        )}

        {installed && (
          <div className="w-full mb-8 py-4 rounded-2xl bg-emerald-500/15 text-emerald-400 font-semibold flex items-center justify-center gap-2">
            <Check className="w-5 h-5" />
            Installation lancée — vérifiez votre écran d'accueil
          </div>
        )}

        {/* Instructions par plateforme */}
        <div className="space-y-4">
          <PlatformCard
            active={platform === "android"}
            icon={<Smartphone className="w-5 h-5" />}
            title="Sur Android (Chrome, Edge, Brave)"
            steps={[
              "Si le bouton « Installer Nex maintenant » est visible ci-dessus, cliquez dessus.",
              "Sinon, ouvrez le menu ⋮ du navigateur en haut à droite.",
              "Choisissez « Installer l'application » ou « Ajouter à l'écran d'accueil ».",
              "Confirmez. Nex apparaîtra avec son icône sur votre écran d'accueil.",
            ]}
          />

          <PlatformCard
            active={platform === "ios"}
            icon={<Apple className="w-5 h-5" />}
            title="Sur iPhone / iPad (Safari uniquement)"
            steps={[
              "Ouvrez cette page dans Safari (pas Chrome).",
              <>
                Touchez le bouton <Share className="inline w-4 h-4 mx-1 align-middle" />
                Partager en bas de l'écran.
              </>,
              <>
                Faites défiler et choisissez{" "}
                <Plus className="inline w-4 h-4 mx-1 align-middle" />
                « Sur l'écran d'accueil ».
              </>,
              "Touchez « Ajouter ». Nex apparaîtra comme une vraie app.",
            ]}
          />

          <PlatformCard
            active={platform === "desktop"}
            icon={<Monitor className="w-5 h-5" />}
            title="Sur Windows / macOS / Linux (Chrome, Edge)"
            steps={[
              "Si le bouton « Installer Nex maintenant » est visible, cliquez dessus.",
              "Sinon, regardez à droite de la barre d'adresse : une petite icône « Installer » (écran avec flèche) apparaît.",
              "Vous pouvez aussi ouvrir le menu ⋮ → « Installer Nex… ».",
              "Nex sera ajouté à votre bureau et au menu Démarrer comme une app classique.",
            ]}
          />
        </div>

        <p className="text-xs text-muted-foreground/70 text-center mt-10 leading-relaxed">
          Astuce : l'installation fonctionne uniquement sur la version publiée de Nex (clevernex.lovable.app ou votre domaine), pas dans l'éditeur Lovable.
        </p>
      </div>
    </main>
  );
}

function PlatformCard({
  icon,
  title,
  steps,
  active,
}: {
  icon: React.ReactNode;
  title: string;
  steps: React.ReactNode[];
  active: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border p-5 transition-colors ${
        active ? "border-primary/60 bg-primary/5" : "border-border/40 bg-white/5"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
          }`}
        >
          {icon}
        </div>
        <h2 className="font-semibold">{title}</h2>
        {active && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
            Votre appareil
          </span>
        )}
      </div>
      <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside marker:text-primary">
        {steps.map((s, i) => (
          <li key={i} className="leading-relaxed">
            {s}
          </li>
        ))}
      </ol>
    </section>
  );
}
