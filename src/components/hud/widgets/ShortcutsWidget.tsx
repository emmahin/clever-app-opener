import { useNavigate } from "react-router-dom";
import {
  MessageSquare, Newspaper, Activity, Calendar, Mic, Settings as SettingsIcon, FileText, Video,
} from "lucide-react";
import { motion } from "framer-motion";

const items = [
  { to: "/", label: "Chat", Icon: MessageSquare },
  { to: "/dashboard", label: "News", Icon: Newspaper },
  { to: "/analytics", label: "Marché", Icon: Activity },
  { to: "/agenda", label: "Agenda", Icon: Calendar },
  { to: "/documents", label: "Docs", Icon: FileText },
  { to: "/video", label: "Vidéo", Icon: Video },
  { to: "/admin/voice", label: "Voix", Icon: Mic },
  { to: "/settings", label: "Config", Icon: SettingsIcon },
];

export function ShortcutsWidget() {
  const navigate = useNavigate();
  return (
    <div className="h-full grid grid-cols-4 gap-2 content-center">
      {items.map(({ to, label, Icon }, i) => (
        <motion.button
          key={to}
          onClick={() => navigate(to)}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.04 }}
          whileHover={{ scale: 1.05, boxShadow: "0 0 14px hsl(var(--primary)/0.55)" }}
          whileTap={{ scale: 0.95 }}
          className="group relative flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-sm border border-primary/40 bg-background/40 text-primary/80 hover:text-primary hover:border-primary transition-colors"
        >
          <Icon className="w-4 h-4" />
          <span className="font-mono text-[9px] uppercase tracking-[0.16em]">{label}</span>
        </motion.button>
      ))}
    </div>
  );
}