import { Link, Navigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Mic, Activity, Stethoscope, ChevronRight, ShieldCheck } from "lucide-react";

const adminPages = [
  {
    title: "Utilisateurs",
    description: "Gérer les comptes, rôles et crédits des utilisateurs.",
    to: "/admin/users",
    icon: Users,
  },
  {
    title: "Voix (ElevenLabs)",
    description: "Quotas, usage et configuration du moteur vocal.",
    to: "/admin/voice",
    icon: Mic,
  },
  {
    title: "Diagnostics OpenAI",
    description: "Tester la connectivité et les modèles OpenAI.",
    to: "/openai-diagnostics",
    icon: Stethoscope,
  },
  {
    title: "Analytics",
    description: "Statistiques d'utilisation de l'application.",
    to: "/analytics",
    icon: Activity,
  },
];

export default function Admin() {
  const { isAdmin, loading } = useIsAdmin();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Chargement…
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Console d'administration</h1>
            <p className="text-sm text-muted-foreground">
              Accès centralisé à toutes les pages réservées aux admins.
            </p>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {adminPages.map(({ title, description, to, icon: Icon }) => (
            <Link key={to} to={to} className="group">
              <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/30">
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{title}</CardTitle>
                      <CardDescription className="mt-1">{description}</CardDescription>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </CardHeader>
                <CardContent className="pt-0">
                  <code className="text-xs text-muted-foreground">{to}</code>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}