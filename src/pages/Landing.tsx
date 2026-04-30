import { Link } from "react-router-dom";
import { Sparkles, Zap, Calendar, FolderOpen, Mic, Bot, FileVideo, Bell, Check, ArrowRight } from "lucide-react";

const FEATURES = [
  { icon: Bot, title: "Chat IA avancé", desc: "Discutez avec un assistant intelligent qui comprend vos besoins, mémorise vos préférences et s'adapte à votre contexte." },
  { icon: Calendar, title: "Agenda intelligent", desc: "Synchronisation Google Calendar, suggestions automatiques, rappels proactifs et organisation de votre semaine." },
  { icon: FolderOpen, title: "Organisation de fichiers", desc: "Triez et classez automatiquement vos documents grâce à l'IA. Recherche sémantique en quelques secondes." },
  { icon: Mic, title: "Mode vocal", desc: "Parlez à Nex naturellement. Transcription en temps réel et réponses vocales fluides." },
  { icon: FileVideo, title: "Édition vidéo IA", desc: "Découpez, montez et améliorez vos vidéos par simple description en langage naturel." },
  { icon: Bell, title: "Notifications proactives", desc: "Nex anticipe vos besoins et vous prévient au bon moment, sans être intrusif." },
];

const HIGHLIGHTS = [
  "Démarrez gratuitement, sans carte bancaire",
  "Vos données restent privées et chiffrées",
  "Disponible sur web, desktop et mobile (PWA)",
  "Annulation possible à tout moment",
];

export default function Landing() {
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
          <nav className="hidden sm:flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Fonctionnalités</a>
            <Link to="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">Tarifs</Link>
            <a href="/legal/terms" className="text-muted-foreground hover:text-foreground transition-colors">Conditions</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="text-sm px-3 py-1.5 rounded-lg hover:bg-muted/50 transition-colors">Se connecter</Link>
            <Link to="/auth" className="text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity">Commencer</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden border-b border-border/50"
        style={{ background: "radial-gradient(ellipse at top, hsl(275, 85%, 12%), hsl(0, 0%, 4%))" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary mb-6">
            <Zap className="w-3 h-3" /> Votre assistant personnel intelligent
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Un assistant IA<br />qui pense <span className="text-primary">avec vous</span>.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Nex est un compagnon numérique qui organise vos fichiers, gère votre agenda, répond à vos questions
            et anticipe vos besoins — par texte ou par la voix, sur tous vos appareils.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link to="/auth" className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2">
              Commencer gratuitement <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/pricing" className="px-6 py-3 rounded-xl border border-border/60 hover:bg-muted/40 transition-colors">
              Voir les tarifs
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            {HIGHLIGHTS.map((h) => (
              <span key={h} className="inline-flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-primary" /> {h}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Tout ce qu'il vous faut, en un seul endroit</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Nex regroupe les outils du quotidien dans une interface unique, pilotée par l'intelligence artificielle.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="p-6 rounded-2xl border border-border/50 bg-card/40 hover:bg-card/70 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border/50 bg-muted/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Comment ça marche ?</h2>
            <p className="text-muted-foreground">Trois étapes pour commencer.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { n: "1", t: "Créez votre compte", d: "Inscription en 30 secondes par e-mail ou avec Google. Aucune carte bancaire requise." },
              { n: "2", t: "Discutez avec Nex", d: "Posez vos questions, donnez vos instructions. Nex apprend votre style et vos préférences." },
              { n: "3", t: "Laissez Nex agir", d: "Organisation de fichiers, planification, rappels, recherche : Nex s'occupe de l'opérationnel." },
            ].map((s) => (
              <div key={s.n} className="text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center mb-4">{s.n}</div>
                <h3 className="font-semibold mb-2">{s.t}</h3>
                <p className="text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Une tarification simple et transparente</h2>
        <p className="text-muted-foreground mb-8">Démarrez gratuitement. Évoluez quand vous voulez.</p>
        <div className="grid sm:grid-cols-4 gap-4 max-w-4xl mx-auto mb-8">
          {[
            { t: "Gratuit", p: "0 €" },
            { t: "Starter", p: "9,99 €" },
            { t: "Pro", p: "29,99 €" },
            { t: "Ultra", p: "99,99 €" },
          ].map((x) => (
            <div key={x.t} className="p-5 rounded-xl border border-border/50">
              <div className="text-sm text-muted-foreground mb-1">{x.t}</div>
              <div className="text-2xl font-bold">{x.p}<span className="text-sm font-normal text-muted-foreground">/mois</span></div>
            </div>
          ))}
        </div>
        <Link to="/pricing" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border/60 hover:bg-muted/40 transition-colors">
          Voir le détail des plans <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      {/* CTA */}
      <section className="border-t border-border/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Prêt à essayer Nex ?</h2>
          <p className="text-muted-foreground mb-8">Créez votre compte en 30 secondes et découvrez ce que Nex peut faire pour vous.</p>
          <Link to="/auth" className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2">
            Commencer gratuitement <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-muted/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row gap-4 items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-primary" />
            </div>
            <span>© {new Date().getFullYear()} Nex — Lucas Hin</span>
          </div>
          <nav className="flex items-center gap-5">
            <Link to="/pricing" className="hover:text-foreground transition-colors">Tarifs</Link>
            <a href="/legal/terms" className="hover:text-foreground transition-colors">Conditions</a>
            <a href="/legal/privacy" className="hover:text-foreground transition-colors">Confidentialité</a>
            <a href="/legal/refund" className="hover:text-foreground transition-colors">Remboursement</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}