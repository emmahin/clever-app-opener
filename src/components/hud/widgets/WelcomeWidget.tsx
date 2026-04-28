import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles } from "lucide-react";

export function WelcomeWidget() {
  const { user } = useAuth();
  const handle = user?.email?.split("@")[0] ?? "USER";
  const hours = new Date().getHours();
  const greeting =
    hours < 6 ? "BONNE NUIT" :
    hours < 12 ? "BONJOUR" :
    hours < 18 ? "BON APRÈS-MIDI" : "BONSOIR";

  return (
    <div className="h-full flex flex-col justify-center">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-primary/70"
      >
        <Sparkles className="w-3 h-3" />
        <span>SYSTÈME EN LIGNE</span>
      </motion.div>
      <h2 className="mt-2 font-display text-2xl md:text-3xl font-bold uppercase tracking-[0.08em] text-neon">
        {greeting},<br />
        <span className="text-foreground">{handle}</span>
      </h2>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground leading-relaxed">
        // Tous les systèmes sont opérationnels. Tu peux glisser-déposer
        et redimensionner chaque module depuis le mode édition.
      </p>
    </div>
  );
}