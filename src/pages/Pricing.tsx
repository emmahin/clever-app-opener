import { Link } from "react-router-dom";
import { Sparkles, Gift, Zap, Crown, Package, Check, X, ArrowRight, Infinity as InfinityIcon } from "lucide-react";

const TIERS = [
  {
    id: "free", label: "Gratuit", price: "0 €", priceNum: 0, credits: 0, icon: Gift, tone: "from-muted/40 to-transparent",
    tagline: "Découvrir Nex sans engagement",
    features: [
      { label: "Accès à l'application", included: true },
      { label: "Historique de chats", included: true },
      { label: "Agent local PC", included: true },
      { label: "Chat IA", included: false },
      { label: "Génération d'images", included: false },
      { label: "Édition vidéo IA", included: false },
    ],
  },
  {
    id: "starter", label: "Starter", price: "9,99 €", priceNum: 9.99, credits: 500, icon: Sparkles, tone: "from-sky-500/20 to-sky-500/5",
    tagline: "Pour un usage occasionnel",
    features: [
      { label: "Tout du plan Gratuit", included: true },
      { label: "Chat IA (selon crédits)", included: true },
      { label: "Génération d'images", included: true },
      { label: "Édition vidéo IA", included: true },
      { label: "Support email", included: true },
    ],
  },
  {
    id: "pro", label: "Pro", price: "29,99 €", priceNum: 29.99, credits: 2000, icon: Zap, tone: "from-violet-500/20 to-violet-500/5", popular: true,
    tagline: "Pour un usage régulier",
    features: [
      { label: "Tout du plan Starter", included: true },
      { label: "4× plus de crédits que Starter", included: true },
      { label: "Modèles IA avancés", included: true },
      { label: "Support email prioritaire", included: true },
    ],
  },
  {
    id: "ultra", label: "Ultra", price: "99,99 €", priceNum: 99.99, credits: 10000, icon: Crown, tone: "from-amber-500/20 to-amber-500/5",
    tagline: "Pour les power users",
    features: [
      { label: "Tout du plan Pro", included: true },
      { label: "10 000 crédits / mois", included: true },
      { label: "Accès anticipé aux nouveautés", included: true },
      { label: "Support prioritaire +", included: true },
    ],
  },
];

const PACKS = [
  { label: "Pack Découverte", price: "2,99 €", credits: 100 },
  { label: "Pack Starter", price: "9,99 €", credits: 500 },
  { label: "Pack Pro", price: "29,99 €", credits: 2000 },
  { label: "Pack Ultra", price: "99,99 €", credits: 10000 },
];

function costPer1k(price: number, credits: number) {
  if (credits === 0) return "—";
  return `${((price / credits) * 1000).toFixed(2).replace(".", ",")} €`;
}

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold">Nex</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="text-sm px-3 py-1.5 rounded-lg hover:bg-muted/50 transition-colors">Se connecter</Link>
            <Link to="/auth" className="text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity">Commencer</Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <header className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">Tarifs</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Démarrez gratuitement. Choisissez un plan quand vous êtes prêt. Annulation à tout moment.
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            Tous les paiements sont traités par notre revendeur en ligne <strong>Paddle.com</strong>, Marchand Officiel.
          </p>
        </header>

        {/* Plans */}
        <section className="mb-16">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TIERS.map((t) => {
              const Icon = t.icon;
              return (
                <div
                  key={t.id}
                  className={`relative p-6 rounded-2xl border border-border/50 bg-gradient-to-br ${t.tone} flex flex-col`}
                >
                  {t.popular && (
                    <span className="absolute top-3 right-3 text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                      Populaire
                    </span>
                  )}
                  <Icon className="w-6 h-6 text-primary mb-2" />
                  <h3 className="text-lg font-semibold">{t.label}</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">{t.price}</span>
                    {t.priceNum > 0 && <span className="text-muted-foreground text-sm"> /mois</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">{t.tagline}</p>
                  <div className="text-sm mb-4">
                    <span className="font-semibold">{t.credits.toLocaleString()}</span>{" "}
                    <span className="text-muted-foreground">crédits / mois</span>
                  </div>
                  <ul className="space-y-2 text-sm flex-1 mb-5">
                    {t.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        {f.included ? (
                          <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                        )}
                        <span className={f.included ? "" : "text-muted-foreground/60 line-through"}>{f.label}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/auth"
                    className={`w-full py-2.5 rounded-lg text-sm font-medium text-center transition-opacity ${
                      t.popular ? "bg-primary text-primary-foreground hover:opacity-90" : "border border-border/60 hover:bg-muted/40"
                    }`}
                  >
                    {t.priceNum === 0 ? "Démarrer gratuitement" : "Choisir ce plan"}
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        {/* Comparatif */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Comparatif détaillé</h2>
          <div className="overflow-x-auto rounded-xl border border-border/50">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left p-3 font-medium">Caractéristique</th>
                  {TIERS.map((t) => <th key={t.id} className="text-center p-3 font-medium">{t.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                <tr><td className="p-3 text-muted-foreground">Prix mensuel</td>{TIERS.map((t) => <td key={t.id} className="text-center p-3 font-medium">{t.price}</td>)}</tr>
                <tr><td className="p-3 text-muted-foreground">Crédits / mois</td>{TIERS.map((t) => <td key={t.id} className="text-center p-3 tabular-nums">{t.credits.toLocaleString()}</td>)}</tr>
                <tr><td className="p-3 text-muted-foreground">Coût / 1 000 crédits</td>{TIERS.map((t) => <td key={t.id} className="text-center p-3 tabular-nums">{costPer1k(t.priceNum, t.credits)}</td>)}</tr>
                {[
                  { label: "Chat IA", map: { free: false, starter: true, pro: true, ultra: true } },
                  { label: "Génération d'images", map: { free: false, starter: true, pro: true, ultra: true } },
                  { label: "Édition vidéo IA", map: { free: false, starter: true, pro: true, ultra: true } },
                  { label: "Agent local PC", map: { free: true, starter: true, pro: true, ultra: true } },
                  { label: "Modèles avancés", map: { free: false, starter: false, pro: true, ultra: true } },
                  { label: "Accès anticipé", map: { free: false, starter: false, pro: false, ultra: true } },
                ].map((row) => (
                  <tr key={row.label}>
                    <td className="p-3 text-muted-foreground">{row.label}</td>
                    {TIERS.map((t) => (
                      <td key={t.id} className="text-center p-3">
                        {row.map[t.id as keyof typeof row.map] ? <Check className="w-4 h-4 text-primary inline" /> : <X className="w-4 h-4 text-muted-foreground/40 inline" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Packs */}
        <section className="mb-16">
          <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-2xl font-bold">Packs de crédits (achat unique)</h2>
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <InfinityIcon className="w-3.5 h-3.5" /> Les crédits achetés n'expirent jamais
            </span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PACKS.map((p) => (
              <div key={p.label} className="p-5 rounded-xl border border-border/50 flex items-center justify-between gap-4">
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
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Questions fréquentes</h2>
          <div className="space-y-4">
            {[
              { q: "Comment fonctionne la garantie de remboursement ?", a: "Nous offrons une garantie satisfait ou remboursé de 30 jours. Voir notre politique de remboursement pour les détails." },
              { q: "Puis-je annuler mon abonnement ?", a: "Oui, à tout moment. L'annulation prend effet à la fin de la période de facturation en cours, vous gardez l'accès jusque-là." },
              { q: "Comment sont consommés les crédits ?", a: "Chaque requête est évaluée selon sa complexité. 1 crédit ≈ 500 tokens. Une question simple coûte ~1 crédit, une image ~50 crédits." },
              { q: "Que se passe-t-il si je n'ai plus de crédits ?", a: "Les fonctionnalités IA sont mises en pause jusqu'au renouvellement, ou jusqu'à l'achat d'un pack." },
              { q: "Qui traite les paiements ?", a: "Tous les paiements sont traités par Paddle.com, qui agit en qualité de Marchand Officiel (Merchant of Record). Paddle gère également les remboursements et la facturation." },
            ].map((f) => (
              <div key={f.q} className="p-5 rounded-xl border border-border/50">
                <div className="font-medium mb-1">{f.q}</div>
                <div className="text-sm text-muted-foreground">{f.a}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="text-center py-10">
          <Link to="/auth" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
            Créer mon compte gratuit <ArrowRight className="w-4 h-4" />
          </Link>
        </section>

        <footer className="border-t border-border/50 pt-8 mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Nex — Lucas Hin</span>
          <nav className="flex items-center gap-5">
            <Link to="/" className="hover:text-foreground transition-colors">Accueil</Link>
            <a href="/legal/terms" className="hover:text-foreground transition-colors">Conditions</a>
            <a href="/legal/privacy" className="hover:text-foreground transition-colors">Confidentialité</a>
            <a href="/legal/refund" className="hover:text-foreground transition-colors">Remboursement</a>
          </nav>
        </footer>
      </div>
    </div>
  );
}