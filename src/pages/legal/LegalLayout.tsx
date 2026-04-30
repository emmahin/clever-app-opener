import { Link } from "react-router-dom";
import { ReactNode } from "react";

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="font-semibold">Nex</Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link to="/legal/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/legal/refund" className="hover:text-foreground">Refund</Link>
            <Link to="/legal/privacy" className="hover:text-foreground">Privacy</Link>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-10 max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-8">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}</p>
        <article className="prose prose-sm dark:prose-invert max-w-none space-y-4 leading-relaxed">
          {children}
        </article>
      </main>
      <footer className="border-t mt-12">
        <div className="container mx-auto px-4 py-6 text-xs text-muted-foreground text-center">
          © {new Date().getFullYear()} Nex — Notre processus de commande est géré par notre revendeur en ligne Paddle.com, qui est le Marchand Officiel (Merchant of Record) pour toutes nos commandes.
        </div>
      </footer>
    </div>
  );
}