import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Coins, Sparkles, Zap, Crown, Package, Check, X, Gift, Infinity as InfinityIcon,
} from "lucide-react";
import { toast } from "sonner";

interface CreditState {
  subscription_credits: number;
  purchased_credits: number;
  subscription_tier: string;
  total_consumed: number;
}

type TierId = "free" | "starter" | "pro" | "ultra";

const TIERS: Array<{
  id: TierId;
  label: string;
  price: string;
  priceNum: number;
  credits: number;
  icon: typeof Sparkles;
  tone: string;
  popular?: boolean;
  tagline: string;
  features: { label: string; included: boolean }[];
}> = [
  {
    id: "free",
    label: "Gratuit",
    price: "0 €",
    priceNum: 0,
    credits: 0,
    icon: Gift,
    tone: "from-muted/40 to-transparent",
    tagline: "Découvrir Nex sans engagement",
    features: [
      { label: "Accès à l'application", included: true },
      { label: "Historique de chats", included: true },
      { label: "Agent local PC", included: true },
      { label: "Chat IA", included: false },
      { label: "Génération d'images", included: false },
      { label: "Édition vidéo IA", included: false },
      { label: "Support communauté", included: true },
    ],
  },
  {
    id: "starter",
    label: "Starter",
    price: "5 €",
    priceNum: 5,
    credits: 2000,
    icon: Sparkles,
    tone: "from-sky-500/20 to-sky-500/5",
    tagline: "Pour un usage occasionnel",
    features: [
      { label: "Tout du plan Gratuit", included: true },
      { label: "Chat IA illimité (selon crédits)", included: true },
      { label: "Génération d'images", included: true },
      { label: "Édition vidéo IA", included: true },
      { label: "Support email", included: true },
    ],
  },
  {
    id: "pro",
    label: "Pro",
    price: "15 €",
    priceNum: 15,
    credits: 8000,
    icon: Zap,
    tone: "from-violet-500/20 to-violet-500/5",
    popular: true,
    tagline: "Pour un usage régulier",
    features: [
      { label: "Tout du plan Starter", included: true },
      { label: "4× plus de crédits que Starter", included: true },
      { label: "Modèles IA avancés", included: true },
      { label: "Support email prioritaire", included: true },
    ],
  },
  {
    id: "ultra",
    label: "Ultra",
    price: "40 €",
    priceNum: 40,
    credits: 25000,
    icon: Crown,
    tone: "from-amber-500/20 to-amber-500/5",
    tagline: "Pour les power users",
    features: [
      { label: "Tout du plan Pro", included: true },
      { label: "25 000 crédits / mois", included: true },
      { label: "Accès anticipé aux nouveautés", included: true },
      { label: "Support prioritaire +", included: true },
    ],
  },
];

const PACKS = [
  { id: "pack-small",  label: "Pack 1 000",  price: "3 €",  credits: 1000 },
  { id: "pack-medium", label: "Pack 5 000",  price: "12 €", credits: 5000 },
  { id: "pack-large",  label: "Pack 10 000", price: "22 €", credits: 10000 },
];

function costPer1k(price: number, credits: number): string {
  if (credits === 0) return "—";
  return `${((price / credits) * 1000).toFixed(2).replace(".", ",")} €`;
}

function estimateUsage(credits: number) {
  if (credits === 0) return null;
  // 1 crédit = 500 tokens. Estimations simples / moyennes / images (~50 cr).
  const simple = Math.floor(credits / 1);   // ~1 cr / question simple
  const medium = Math.floor(credits / 5);   // ~5 cr / analyse
  const images = Math.floor(credits / 50);  // ~50 cr / image
  return { simple, medium, images };
}

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
  const currentTier = (credits?.subscription_tier ?? "free") as TierId;

  const notReady = () => toast.info("Paiement bientôt disponible", {
    description: "Le module de paiement sera activé une fois le fournisseur configuré.",
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>

        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Crédits & abonnement</h1>
          <p className="text-muted-foreground mt-2">
            Choisissez la formule qui vous convient. Vous pouvez changer d'abonnement à tout moment.
          </p>
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
                <div>Plan : <span className="font-medium text-foreground capitalize">{currentTier}</span></div>
                <div>Abonnement : <span className="font-medium text-foreground">{credits?.subscription_credits.toLocaleString() ?? 0}</span></div>
                <div>Achetés : <span className="font-medium text-foreground">{credits?.purchased_credits.toLocaleString() ?? 0}</span></div>
                <div>Consommés : <span className="font-medium text-foreground">{credits?.total_consumed.toLocaleString() ?? 0}</span></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Plans */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Tous les plans</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TIERS.map((t) => {
              const Icon = t.icon;
              const isCurrent = currentTier === t.id;
              const usage = estimateUsage(t.credits);
              return (
                <Card
                  key={t.id}
                  className={`relative border-border/50 bg-gradient-to-br ${t.tone} overflow-hidden flex flex-col ${
                    isCurrent ? "ring-2 ring-primary" : ""
                  }`}
                >
                  {t.popular && !isCurrent && (
                    <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground">Populaire</Badge>
                  )}
                  {isCurrent && (
                    <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground">Plan actuel</Badge>
                  )}
                  <CardHeader>
                    <Icon className="w-6 h-6 text-primary mb-2" />
                    <CardTitle>{t.label}</CardTitle>
                    <CardDescription>
                      <span className="text-2xl font-bold text-foreground">{t.price}</span>
                      {t.priceNum > 0 && <span className="text-muted-foreground"> /mois</span>}
                    </CardDescription>
                    <p className="text-xs text-muted-foreground mt-1">{t.tagline}</p>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <div className="text-sm mb-3">
                      <span className="font-semibold text-foreground">
                        {t.credits.toLocaleString()}
                      </span>{" "}
                      <span className="text-muted-foreground">crédits / mois</span>
                    </div>

                    {usage && (
                      <div className="text-xs text-muted-foreground space-y-1 mb-4 p-3 rounded-lg bg-muted/30">
                        <div>≈ {usage.simple.toLocaleString()} questions simples</div>
                        <div>≈ {usage.medium.toLocaleString()} analyses moyennes</div>
                        <div>≈ {usage.images.toLocaleString()} images générées</div>
                      </div>
                    )}

                    <ul className="space-y-2 mb-4 text-sm flex-1">
                      {t.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2">
                          {f.included ? (
                            <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                          ) : (
                            <X className="w-4 h-4 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                          )}
                          <span className={f.included ? "" : "text-muted-foreground/60 line-through"}>
                            {f.label}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      onClick={notReady}
                      className="w-full"
                      variant={t.popular ? "default" : "outline"}
                      disabled={isCurrent}
                    >
                      {isCurrent ? "Plan actuel" : t.priceNum === 0 ? "Plan gratuit" : "Choisir"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Tableau comparatif */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Comparatif détaillé</h2>
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left p-3 font-medium">Caractéristique</th>
                  {TIERS.map((t) => (
                    <th key={t.id} className="text-center p-3 font-medium">{t.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="p-3 text-muted-foreground">Prix mensuel</td>
                  {TIERS.map((t) => (
                    <td key={t.id} className="text-center p-3 font-medium">{t.price}</td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 text-muted-foreground">Crédits / mois</td>
                  {TIERS.map((t) => (
                    <td key={t.id} className="text-center p-3 tabular-nums">{t.credits.toLocaleString()}</td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 text-muted-foreground">Coût / 1 000 crédits</td>
                  {TIERS.map((t) => (
                    <td key={t.id} className="text-center p-3 tabular-nums">{costPer1k(t.priceNum, t.credits)}</td>
                  ))}
                </tr>
                {[
                  { label: "Chat IA",            map: { free: false, starter: true,  pro: true,  ultra: true } },
                  { label: "Génération d'images", map: { free: false, starter: true,  pro: true,  ultra: true } },
                  { label: "Édition vidéo IA",   map: { free: false, starter: true,  pro: true,  ultra: true } },
                  { label: "Agent local PC",     map: { free: true,  starter: true,  pro: true,  ultra: true } },
                  { label: "Modèles avancés",    map: { free: false, starter: false, pro: true,  ultra: true } },
                  { label: "Accès anticipé",     map: { free: false, starter: false, pro: false, ultra: true } },
                ].map((row) => (
                  <tr key={row.label}>
                    <td className="p-3 text-muted-foreground">{row.label}</td>
                    {TIERS.map((t) => (
                      <td key={t.id} className="text-center p-3">
                        {row.map[t.id] ? (
                          <Check className="w-4 h-4 text-primary inline" />
                        ) : (
                          <X className="w-4 h-4 text-muted-foreground/40 inline" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="p-3 text-muted-foreground">Support</td>
                  <td className="text-center p-3 text-xs">Communauté</td>
                  <td className="text-center p-3 text-xs">Email</td>
                  <td className="text-center p-3 text-xs">Email prio</td>
                  <td className="text-center p-3 text-xs">Prio +</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Packs */}
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-xl font-semibold">Packs de crédits (achat unique)</h2>
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <InfinityIcon className="w-3.5 h-3.5" /> Les crédits achetés n'expirent jamais
            </span>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {PACKS.map((p) => (
              <Card key={p.id} className="border-border/50">
                <CardContent className="pt-6 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted/40 flex items-center justify-center">
                      <Package className="w-5 h-5 text-foreground/70" />
                    </div>
                    <div>
                      <div className="font-medium">{p.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.credits.toLocaleString()} crédits · {costPer1k(parseFloat(p.price), p.credits)} / 1k
                      </div>
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
          <p className="text-xs text-muted-foreground mt-3">
            Les crédits d'abonnement sont consommés en priorité, puis les crédits achetés.
          </p>
        </section>

        {/* FAQ */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Questions fréquentes</h2>
          <div className="space-y-3">
            {[
              {
                q: "Comment sont consommés les crédits ?",
                a: "Chaque requête est évaluée selon la longueur de l'entrée, la complexité du raisonnement, la longueur de la réponse et les outils utilisés. 1 crédit ≈ 500 tokens. Minimum 1 crédit, maximum 50 crédits par requête.",
              },
              {
                q: "Que se passe-t-il si je n'ai plus de crédits ?",
                a: "Les fonctionnalités IA seront mises en pause jusqu'au prochain renouvellement de votre abonnement, ou jusqu'à l'achat d'un pack de crédits.",
              },
              {
                q: "Puis-je changer d'abonnement ?",
                a: "Oui, à tout moment. Vous pouvez passer à un plan supérieur ou inférieur sans engagement.",
              },
              {
                q: "Les crédits non utilisés sont-ils reportés ?",
                a: "Les crédits d'abonnement se réinitialisent chaque mois. En revanche, les crédits achetés via un pack n'expirent jamais.",
              },
            ].map((item, i) => (
              <Card key={i} className="border-border/50">
                <CardContent className="pt-4">
                  <div className="font-medium mb-1">{item.q}</div>
                  <div className="text-sm text-muted-foreground">{item.a}</div>
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
