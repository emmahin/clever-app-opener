import { useEffect, useState } from "react";
import { Bell, BellOff, Smartphone, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { pushService } from "@/services/pushService";

export function NotificationsPermissionCard() {
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false);

  useEffect(() => {
    setSupported(pushService.isSupported());
    setPermission(pushService.permission());
    setIosNeedsInstall(pushService.isIOS() && !pushService.isStandalone());
    pushService.getCurrentSubscription().then((s) => setSubscribed(!!s)).catch(() => {});
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    try {
      await pushService.subscribe();
      setSubscribed(true);
      setPermission(pushService.permission());
      toast.success("Notifications système activées 🎉");
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible d'activer les notifications");
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    setLoading(true);
    try {
      await pushService.unsubscribe();
      setSubscribed(false);
      toast.success("Notifications système désactivées");
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  };

  if (!supported) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/40 border border-border/60">
        <BellOff className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-medium">Non supporté</div>
          <p className="text-xs text-muted-foreground mt-1">
            Ton navigateur ne supporte pas les notifications push. Essaie Chrome, Edge, Firefox, ou Safari récent.
          </p>
        </div>
      </div>
    );
  }

  if (iosNeedsInstall) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
        <Smartphone className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-medium">Étape requise sur iPhone/iPad</div>
          <p className="text-xs text-muted-foreground mt-1">
            Ouvre le menu Partage de Safari → <strong>Sur l'écran d'accueil</strong>, puis lance l'app depuis l'icône installée pour activer les notifications.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
            {subscribed ? <CheckCircle2 className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">
              {subscribed ? "Notifications système actives" : "Recevoir des notifications même app fermée"}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {subscribed
                ? "Cet appareil reçoit les rappels d'agenda et suggestions de Nex."
                : "Active pour que Nex puisse te rappeler tes events et envoyer des suggestions sur PC ou mobile, même quand l'app est fermée."}
            </p>
            {permission === "denied" && (
              <p className="text-xs text-destructive mt-1">
                Permission bloquée — autorise les notifications dans les réglages du navigateur.
              </p>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={subscribed ? handleDisable : handleEnable}
        disabled={loading || permission === "denied"}
        className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2 ${
          subscribed ? "bg-secondary hover:bg-secondary/80" : "bg-primary text-primary-foreground hover:opacity-90"
        }`}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {subscribed ? "Désactiver sur cet appareil" : "Activer les notifications système"}
      </button>
    </div>
  );
}