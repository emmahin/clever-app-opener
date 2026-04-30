import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Sparkles, Mail, Lock, Loader2, Eye, EyeOff, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

type Mode = "signin" | "signup" | "forgot";

export default function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/app", { replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate("/app", { replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Connecté");
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast.success("E-mail de réinitialisation envoyé");
        setMode("signin");
      }
    } catch (err: any) {
      const msg = err?.message ?? "Erreur";
      if (/email not confirmed/i.test(msg)) {
        toast.error("E-mail non confirmé. Vérifie ta boîte mail (et les spams).");
      } else if (/invalid login/i.test(msg)) {
        toast.error("E-mail ou mot de passe incorrect.");
      } else if (/already registered|user already/i.test(msg)) {
        toast.error("Cet e-mail est déjà utilisé. Essaie de te connecter.");
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Connexion Google impossible");
        setGoogleLoading(false);
        return;
      }
      // Si redirected → la page va recharger. Sinon session déjà posée → onAuthStateChange redirige.
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur Google");
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4"
      style={{ background: "radial-gradient(ellipse at top, hsl(275, 85%, 15%), hsl(0, 0%, 4%))" }}>
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">Nex</h1>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-6 shadow-2xl">
          <div className="mb-6 text-center">
            <h2 className="text-lg font-semibold">
              {mode === "forgot"
                ? "Réinitialiser le mot de passe"
                : mode === "signup"
                ? "Créer un compte"
                : "Se connecter"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === "forgot"
                ? "Reçois un lien par e-mail pour choisir un nouveau mot de passe."
                : mode === "signup"
                ? "Crée ton compte pour commencer à discuter avec Nex."
                : "Connecte-toi à ton compte."}
            </p>
          </div>

          {mode !== "forgot" && (
            <>
              <button
                type="button"
                onClick={onGoogle}
                disabled={googleLoading || loading}
                className="w-full py-2.5 rounded-lg bg-white text-gray-800 text-sm font-medium hover:bg-gray-100 transition-colors flex items-center justify-center gap-3 disabled:opacity-60 mb-4"
              >
                {googleLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
                    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C41 35.5 44 30.2 44 24c0-1.3-.1-2.4-.4-3.5z"/>
                  </svg>
                )}
                Continuer avec Google
              </button>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-border/60" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">ou</span>
                <div className="flex-1 h-px bg-border/60" />
              </div>
            </>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Nom</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-primary"
                    placeholder="Ton prénom"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">E-mail</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-primary"
                  placeholder="vous@exemple.com"
                />
              </div>
            </div>

            {mode !== "forgot" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Mot de passe</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-secondary/40 border border-border/60 text-sm focus:outline-none focus:border-primary"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mode === "signup" && (
                  <p className="text-[10px] text-muted-foreground mt-1.5">Au moins 6 caractères.</p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "signin"
                ? "Se connecter"
                : mode === "signup"
                ? "Créer mon compte"
                : "Envoyer l'e-mail"}
            </button>
          </form>

          <div className="mt-4 text-center space-y-2">
            {mode === "signin" && (
              <>
                <button onClick={() => setMode("forgot")} className="block w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Mot de passe oublié ?
                </button>
                <p className="text-xs text-muted-foreground pt-2">
                  Pas encore de compte ?{" "}
                  <button onClick={() => setMode("signup")} className="text-primary hover:underline font-medium">
                    Créer un compte
                  </button>
                </p>
              </>
            )}
            {mode === "signup" && (
              <p className="text-xs text-muted-foreground">
                Déjà un compte ?{" "}
                <button onClick={() => setMode("signin")} className="text-primary hover:underline font-medium">
                  Se connecter
                </button>
              </p>
            )}
            {mode === "forgot" && (
              <button onClick={() => setMode("signin")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                ← Retour à la connexion
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          En créant un compte, tu acceptes nos{" "}
          <a href="/legal/terms" className="underline hover:text-foreground">Conditions</a>,{" "}
          notre{" "}
          <a href="/legal/privacy" className="underline hover:text-foreground">Politique de confidentialité</a>{" "}
          et notre{" "}
          <a href="/legal/refund" className="underline hover:text-foreground">Politique de remboursement</a>.
        </p>
      </div>
    </div>
  );
}
