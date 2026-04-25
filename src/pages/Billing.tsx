import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Coins, Sparkles, Zap, Crown, Package } from "lucide-react";
import { toast } from "sonner";

interface CreditState {
  subscription_credits: number;
  purchased_credits: number;
  subscription_tier: string;
  total_consumed: number;
}

const SUBSCRIPTIONS = [
  { id: "starter", label: "Starter", price: "5 €", credits: 2000, icon: Sparkles, tone: "from-sky-500/20 to-sky-500/5" },
  { id: "pro",     label: "Pro",     price: "15 €", credits: 8000, icon: Zap,      tone: "from-violet-500/20 to-violet-500/5", popular: true },
  { id: "ultra",   label: "Ultra",   price: "40 €", credits: 25000, icon: Crown,   tone: "from-amber-500/20 to-amber-500/5" },
];

const PACKS = [
  { id: "pack-small",  label: "Pack 1 000",  price: "3 €",  credits: 1000 },
  { id: "pack-medium", label: "Pack 5 000",  price: "12 €", credits: 5000 },
];

export default function Billing() {
  const navigate = useNavigate();
  const [credits, setCredits] = useState<CreditState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }
      const { data, error } = await supabase
        .from("user_credits")
        .select("subscription_credits, purchased_credits, subscription_tier, total_consumed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!mounted) return;
      if (error) console.error(error);
      setCredits(data || { subscription_credits: 0, purchased_credits: 0, subscription_tier: "free", total_consumed: 0 });
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [navigate]);

  const total = (credits?.subscription_credits ?? 0) + (credits?.purchased_credits ?? 0);

  const notReady = () => toast.info("Paiement bientôt disponible", {
    description: "Le module de paiement sera activé une fois le fournisseur configuré.",
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>

        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Crédits & abonnement</h1>
          <p className="text-muted-foreground mt-2">Gérez votre solde et choisissez la formule qui vous convient.</p>
        </header>

        {/* Solde */}
        <Card className="mb-10 border-border/50 bg-gradient-to-br from-primary/10 to-transparent">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center">
                  <Coins className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Solde actuel</div>
                  <div className="text-3xl font-bold tabular-nums">
                    {loading ? "…" : total.toLocaleString()}
                    <span className="text-base font-normal text-muted-foreground ml-2">crédits</span>
                  </div>
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground space-y-1">
                <div>Abonnement : <span className="font-medium text-foreground">{credits?.subscription_credits.toLocaleString() ?? 0}</span></div>
                <div>Achetés : <span className="font-medium text-foreground">{credits?.purchased_credits.toLocaleString() ?? 0}</span></div>
                <div>Consommés : <span className="font-medium text-foreground">{credits?.total_consumed.toLocaleString() ?? 0}</span></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Abonnements */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Abonnements mensuels</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {SUBSCRIPTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.id} className={`relative border-border/50 bg-gradient-to-br ${s.tone} overflow-hidden`}>
                  {s.popular && (
                    <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground">Populaire</Badge>
                  )}
                  <CardHeader>
                    <Icon className="w-6 h-6 text-primary mb-2" />
                    <CardTitle>{s.label}</CardTitle>
                    <CardDescription>
                      <span className="text-2xl font-bold text-foreground">{s.price}</span>
                      <span className="text-muted-foreground"> /mois</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      <span className="font-medium text-foreground">{s.credits.toLocaleString()}</span> crédits/mois
                    </p>
                    <Button onClick={notReady} className="w-full" variant={s.popular ? "default" : "outline"}>
                      Choisir
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Packs */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Packs de crédits (achat unique)</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {PACKS.map((p) => (
              <Card key={p.id} className="border-border/50">
                <CardContent className="pt-6 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted/40 flex items-center justify-center">
                      <Package className="w-5 h-5 text-foreground/70" />
                    </div>
                    <div>
                      <div className="font-medium">{p.label}</div>
                      <div className="text-xs text-muted-foreground">{p.credits.toLocaleString()} crédits</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">{p.price}</div>
                    <Button onClick={notReady} size="sm" variant="outline" className="mt-1">Acheter</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <p className="text-xs text-muted-foreground mt-10 text-center">
          Le module de paiement sera activé prochainement. Contactez le support pour un accès anticipé.
        </p>
      </div>
    </div>
  );
}