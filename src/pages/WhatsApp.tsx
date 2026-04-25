import { useState, useEffect, useRef, useMemo } from "react";
import { Sidebar as AppSidebar } from "@/components/chatbot/Sidebar";
import {
  Search, MoreVertical, Phone, Video, Send, Paperclip, Smile, Mic, Plus,
  MessageCircle, Check, CheckCheck, X, Archive, Filter, Sparkles, Image as ImageIcon,
  FileText, StopCircle, Play, Pause, Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { notificationService } from "@/services/notificationService";

interface Attachment {
  kind: "image" | "file" | "audio";
  name: string;
  mime: string;
  dataUrl: string; // base64 data URL stored locally
  size: number;
  duration?: number; // seconds for audio
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  avatarColor: string;
  about?: string;
  isDemo?: boolean;
}

interface Message {
  id: string;
  contactId: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  status: "sent" | "delivered" | "read";
  attachment?: Attachment;
}

const LS_CONTACTS = "wa_contacts";
const LS_MESSAGES = "wa_messages";
const LS_DEMO_SEEDED = "wa_demo_seeded";

const AVATAR_COLORS = [
  "from-purple-500 to-fuchsia-600",
  "from-violet-500 to-purple-700",
  "from-fuchsia-500 to-pink-600",
  "from-indigo-500 to-violet-600",
  "from-purple-400 to-indigo-600",
  "from-pink-500 to-purple-600",
  "from-violet-600 to-fuchsia-700",
  "from-purple-600 to-pink-700",
];

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: "Smileys", emojis: "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐".split(" ") },
  { label: "Cœurs", emojis: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟".split(" ") },
  { label: "Gestes", emojis: "👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤛 🤜 👊 ✊ 🤝 🙏 💪 🦾 🦿".split(" ") },
  { label: "Fête", emojis: "🎉 🎊 🥳 🎈 🎂 🎁 🎄 🎃 🎆 🎇 ✨ 🎀 🎗️ 🏆 🥇 🥈 🥉 🏅 🎖️".split(" ") },
  { label: "Objets", emojis: "🔥 💯 ⭐ 🌟 💫 ⚡ ☀️ 🌈 ☁️ 🌙 💧 🌊 🍕 🍔 🍟 🌮 🍣 🍰 ☕ 🍺 🍷 🥂 ⚽ 🏀 🎮 🎵 🎶 📱 💻 ⌚ 📷 🎬 📚 ✏️ 💡 🔑 🚀 ✈️ 🚗".split(" ") },
];

function loadContacts(): Contact[] {
  try { return JSON.parse(localStorage.getItem(LS_CONTACTS) || "[]"); } catch { return []; }
}
function loadMessages(): Message[] {
  try { return JSON.parse(localStorage.getItem(LS_MESSAGES) || "[]"); } catch { return []; }
}
function saveContacts(c: Contact[]) { localStorage.setItem(LS_CONTACTS, JSON.stringify(c)); }
function saveMessages(m: Message[]) { localStorage.setItem(LS_MESSAGES, JSON.stringify(m)); }

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} Ko`;
  return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
}

function seedDemoIfNeeded(): { contacts: Contact[]; messages: Message[] } | null {
  if (localStorage.getItem(LS_DEMO_SEEDED) === "1") return null;
  const existing = loadContacts();
  if (existing.length > 0) {
    localStorage.setItem(LS_DEMO_SEEDED, "1");
    return null;
  }
  const demoId = crypto.randomUUID();
  const demoContact: Contact = {
    id: demoId, name: "Léa Martin (démo)", phone: "+33 6 00 00 00 00",
    avatarColor: AVATAR_COLORS[1], about: "Aperçu — supprimez-moi quand vous voulez", isDemo: true,
  };
  const now = Date.now();
  const demoMessages: Message[] = [
    { id: crypto.randomUUID(), contactId: demoId, body: "Salut ! 👋", fromMe: false, timestamp: now - 1000 * 60 * 60 * 3, status: "read" },
    { id: crypto.randomUUID(), contactId: demoId, body: "Hey Léa, ça va ?", fromMe: true, timestamp: now - 1000 * 60 * 60 * 2.9, status: "read" },
    { id: crypto.randomUUID(), contactId: demoId, body: "Super et toi ? Tu testes ta nouvelle interface ?", fromMe: false, timestamp: now - 1000 * 60 * 60 * 2.8, status: "read" },
    { id: crypto.randomUUID(), contactId: demoId, body: "Yes ! Je viens de l'intégrer dans Nex 🚀", fromMe: true, timestamp: now - 1000 * 60 * 30, status: "delivered" },
    { id: crypto.randomUUID(), contactId: demoId, body: "Trop stylé le thème violet 💜", fromMe: false, timestamp: now - 1000 * 60 * 5, status: "read" },
  ];
  saveContacts([demoContact]); saveMessages(demoMessages);
  localStorage.setItem(LS_DEMO_SEEDED, "1");
  return { contacts: [demoContact], messages: demoMessages };
}

function initials(name: string): string {
  return name.replace(/\(.*?\)/g, "").trim().split(" ")
    .map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

// Component pour lire un message audio avec contrôles
function AudioBubble({ src, duration }: { src: string; duration?: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  };

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <audio ref={audioRef} src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrent(0); }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          setCurrent(a.currentTime);
          if (a.duration) setProgress((a.currentTime / a.duration) * 100);
        }}
      />
      <button onClick={toggle} className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white shrink-0">
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className="h-1 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-white/70 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="text-[10px] text-white/60 mt-1">
          {duration ? formatDuration(playing || current ? current : duration) : formatDuration(current)}
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<Attachment | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAbout, setNewAbout] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Voice recording
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartRef = useRef<number>(0);

  useEffect(() => {
    const seeded = seedDemoIfNeeded();
    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("contact");
    if (seeded) {
      setContacts(seeded.contacts); setMessages(seeded.messages);
      setActiveId(requestedId && seeded.contacts.some((c) => c.id === requestedId) ? requestedId : seeded.contacts[0].id);
    } else {
      const c = loadContacts();
      setContacts(c); setMessages(loadMessages());
      if (c.length > 0) setActiveId(requestedId && c.some((x) => x.id === requestedId) ? requestedId : c[0].id);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeId, messages.length]);

  const activeContact = contacts.find((c) => c.id === activeId);
  const activeMessages = useMemo(
    () => messages.filter((m) => m.contactId === activeId).sort((a, b) => a.timestamp - b.timestamp),
    [messages, activeId],
  );

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [contacts, search]);

  const lastMessageOf = (contactId: string) => {
    const list = messages.filter((m) => m.contactId === contactId);
    return list.length ? list.sort((a, b) => b.timestamp - a.timestamp)[0] : null;
  };

  const handleAddContact = () => {
    if (!newName.trim() || !newPhone.trim()) return;
    const c: Contact = {
      id: crypto.randomUUID(), name: newName.trim(), phone: newPhone.trim(),
      avatarColor: AVATAR_COLORS[contacts.length % AVATAR_COLORS.length],
      about: newAbout.trim() || "Disponible",
    };
    const next = [...contacts, c];
    setContacts(next); saveContacts(next);
    setNewName(""); setNewPhone(""); setNewAbout("");
    setAddOpen(false); setActiveId(c.id);
  };

  const handleDeleteContact = (id: string) => {
    const nextContacts = contacts.filter((c) => c.id !== id);
    const nextMessages = messages.filter((m) => m.contactId !== id);
    setContacts(nextContacts); setMessages(nextMessages);
    saveContacts(nextContacts); saveMessages(nextMessages);
    if (activeId === id) setActiveId(nextContacts[0]?.id ?? null);
  };

  const handleSend = (overrideAttachment?: Attachment) => {
    const att = overrideAttachment ?? pendingAttachment;
    if ((!draft.trim() && !att) || !activeId) return;
    const targetContactId = activeId;
    const targetContact = contacts.find((c) => c.id === targetContactId);
    const msg: Message = {
      id: crypto.randomUUID(),
      contactId: targetContactId,
      body: draft.trim(),
      fromMe: true,
      timestamp: Date.now(),
      status: "sent",
      attachment: att ?? undefined,
    };
    const next = [...messages, msg];
    setMessages(next); saveMessages(next);
    setDraft(""); setPendingAttachment(null);
    setTimeout(() => {
      setMessages((cur) => {
        const updated = cur.map((m) => (m.id === msg.id ? { ...m, status: "delivered" as const } : m));
        saveMessages(updated);
        return updated;
      });
    }, 800);
    // Simulate a reply ~50% of the time after 4-12s, only for plain text messages
    if (msg.body && !att && targetContact && Math.random() < 0.5) {
      const replyDelay = 4000 + Math.random() * 8000;
      const replies = [
        "Ah ok 👌",
        "Top, merci !",
        "Je te réponds plus tard 😉",
        "Carrément 💜",
        "Pas de souci, on en reparle.",
        "Intéressant, raconte 🙂",
      ];
      const replyBody = replies[Math.floor(Math.random() * replies.length)];
      setTimeout(() => {
        const reply: Message = {
          id: crypto.randomUUID(),
          contactId: targetContactId,
          body: replyBody,
          fromMe: false,
          timestamp: Date.now(),
          status: "read",
        };
        setMessages((cur) => {
          const updated = [...cur, reply];
          saveMessages(updated);
          return updated;
        });
        notificationService.notify({
          type: "whatsapp_message",
          title: targetContact.name,
          body: replyBody,
          source: "WhatsApp",
          actionUrl: `/whatsapp?contact=${targetContactId}`,
        });
      }, replyDelay);
    }
  };

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>, kind: "image" | "file") => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Fichier trop lourd", description: "Limite : 10 Mo (stockage local)." });
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setPendingAttachment({
        kind, name: file.name, mime: file.type || "application/octet-stream",
        dataUrl, size: file.size,
      });
    } catch {
      toast({ title: "Erreur", description: "Impossible de lire le fichier." });
    }
  };

  const insertEmoji = (e: string) => {
    setDraft((d) => d + e);
    inputRef.current?.focus();
  };

  // ----- Voice recording -----
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const dataUrl = await fileToDataUrl(blob);
        const dur = (Date.now() - recordStartRef.current) / 1000;
        const att: Attachment = {
          kind: "audio",
          name: `Message vocal (${formatDuration(dur)})`,
          mime: "audio/webm",
          dataUrl,
          size: blob.size,
          duration: dur,
        };
        // Auto-send the voice message immediately
        handleSend(att);
      };
      mediaRecorderRef.current = mr;
      recordStartRef.current = Date.now();
      mr.start();
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      toast({
        title: "Micro indisponible",
        description: "Autorisez l'accès au microphone dans votre navigateur.",
      });
    }
  };

  const stopRecording = (cancel = false) => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setRecording(false);
    setRecordSeconds(0);
    if (cancel && mediaRecorderRef.current) {
      // Detach onstop to avoid sending
      mediaRecorderRef.current.onstop = (e) => {
        const stream = (e.target as MediaRecorder).stream;
        stream?.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      return;
    }
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  };

  const pageBg = {
    backgroundImage:
      "radial-gradient(ellipse 100% 80% at 20% 100%, hsl(280 90% 35%) 0%, transparent 55%), radial-gradient(ellipse 90% 70% at 80% 90%, hsl(295 85% 28%) 0%, transparent 55%), linear-gradient(180deg, hsl(0 0% 0%) 0%, hsl(275 60% 6%) 55%, hsl(270 75% 18%) 100%)",
    backgroundAttachment: "fixed" as const,
  };

  const PANEL_BG = "bg-[hsl(270_30%_8%)]";
  const PANEL_HEADER = "bg-[hsl(275_35%_12%)]";
  const PANEL_HOVER = "hover:bg-[hsl(275_30%_14%)]";
  const PANEL_ACTIVE = "bg-[hsl(275_40%_18%)]";
  const INPUT_BG = "bg-[hsl(275_30%_14%)]";
  const BORDER = "border-[hsl(275_30%_18%)]";

  return (
    <div className="min-h-screen text-foreground overflow-hidden" style={pageBg}>
      <AppSidebar />

      <main className="ml-0 md:[margin-left:var(--sidebar-w,280px)] md:transition-[margin-left] md:duration-300 px-2 md:px-4 py-2 md:py-4 h-screen pt-14 md:pt-4">
        <div className={`h-full max-w-[1600px] mx-auto rounded-2xl overflow-hidden shadow-[0_20px_80px_-20px_rgba(168,85,247,0.4)] flex ${PANEL_BG} border ${BORDER}`}>
          {/* LEFT */}
          <aside className={`w-[400px] flex flex-col border-r ${BORDER}`}>
            <div className={`h-16 px-4 flex items-center justify-between ${PANEL_HEADER} border-b ${BORDER}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.5)]">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Mon compte</div>
                  <div className="text-[10px] text-purple-300/60 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    En ligne
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-purple-200/70">
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                  <DialogTrigger asChild>
                    <button title="Nouveau contact" className="p-2 rounded-full hover:bg-purple-500/20 hover:text-white transition-colors">
                      <Plus className="w-5 h-5" />
                    </button>
                  </DialogTrigger>
                  <DialogContent className={`${PANEL_HEADER} ${BORDER} text-white`}>
                    <DialogHeader><DialogTitle className="text-purple-200">Nouveau contact</DialogTitle></DialogHeader>
                    <div className="space-y-3 py-2">
                      <div>
                        <label className="text-xs text-purple-200/60">Nom</label>
                        <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                          placeholder="Marie Dupont" className={`mt-1 ${INPUT_BG} ${BORDER} text-white`} />
                      </div>
                      <div>
                        <label className="text-xs text-purple-200/60">Téléphone</label>
                        <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                          placeholder="+33 6 12 34 56 78" className={`mt-1 ${INPUT_BG} ${BORDER} text-white`} />
                      </div>
                      <div>
                        <label className="text-xs text-purple-200/60">À propos (optionnel)</label>
                        <Input value={newAbout} onChange={(e) => setNewAbout(e.target.value)}
                          placeholder="Disponible" className={`mt-1 ${INPUT_BG} ${BORDER} text-white`} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleAddContact} className="bg-gradient-to-r from-purple-500 to-fuchsia-600 hover:opacity-90 text-white">
                        Ajouter
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <button className="p-2 rounded-full hover:bg-purple-500/20 hover:text-white transition-colors">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className={`p-2 ${PANEL_BG}`}>
              <div className={`flex items-center gap-2 ${INPUT_BG} rounded-lg px-3 py-1.5 border ${BORDER}`}>
                <Search className="w-4 h-4 text-purple-300/50" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher ou démarrer une discussion"
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-purple-200/30 outline-none" />
                <Filter className="w-4 h-4 text-purple-300/40" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredContacts.length === 0 && (
                <div className="p-8 text-center text-purple-200/40 text-sm">
                  <Archive className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  Aucun contact. Cliquez sur <Plus className="w-3 h-3 inline mx-1" /> pour en ajouter.
                </div>
              )}
              {filteredContacts.map((c) => {
                const last = lastMessageOf(c.id);
                const isActive = c.id === activeId;
                const lastPreview = last
                  ? last.body || (last.attachment?.kind === "image" ? "📷 Photo"
                      : last.attachment?.kind === "audio" ? "🎤 Message vocal"
                      : last.attachment ? "📎 " + last.attachment.name : "")
                  : null;
                return (
                  <button key={c.id} onClick={() => setActiveId(c.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 border-b ${BORDER} text-left transition-colors ${
                      isActive ? PANEL_ACTIVE : PANEL_HOVER
                    }`}>
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${c.avatarColor} flex items-center justify-center text-white font-semibold shrink-0 shadow-[0_0_12px_rgba(168,85,247,0.3)]`}>
                      {initials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium truncate flex items-center gap-2">
                          {c.name}
                          {c.isDemo && (
                            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-200">démo</span>
                          )}
                        </span>
                        {last && <span className="text-[11px] text-purple-200/40 shrink-0 ml-2">{formatTime(last.timestamp)}</span>}
                      </div>
                      <div className="text-xs text-purple-200/50 truncate">
                        {last ? (
                          <>
                            {last.fromMe && <CheckCheck className="w-3 h-3 inline mr-1 text-purple-300" />}
                            {lastPreview}
                          </>
                        ) : (c.about || c.phone)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* RIGHT */}
          <section className="flex-1 flex flex-col relative" style={{
            backgroundImage: `radial-gradient(circle at 50% 50%, hsl(275 40% 10%) 0%, hsl(270 50% 5%) 100%), url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><g fill='%23a855f7' fill-opacity='0.04'><circle cx='40' cy='40' r='1'/><circle cx='10' cy='10' r='0.5'/><circle cx='70' cy='20' r='0.5'/><circle cx='20' cy='65' r='0.5'/></g></svg>")`,
            backgroundBlendMode: "overlay",
          }}>
            {!activeContact ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-600/20 to-fuchsia-600/20 flex items-center justify-center mb-6 border border-purple-500/30">
                  <MessageCircle className="w-16 h-16 text-purple-300/60" />
                </div>
                <h2 className="text-2xl font-light text-white mb-2">
                  Messagerie <span className="bg-gradient-to-r from-purple-400 to-fuchsia-400 bg-clip-text text-transparent font-semibold">Nex</span>
                </h2>
                <p className="text-sm text-purple-200/50 max-w-md">
                  Sélectionnez un contact pour commencer à discuter, ou ajoutez-en un nouveau via le bouton +.
                </p>
              </div>
            ) : (
              <>
                <div className={`h-16 px-4 flex items-center justify-between ${PANEL_HEADER} border-b ${BORDER}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${activeContact.avatarColor} flex items-center justify-center text-white font-semibold shadow-[0_0_12px_rgba(168,85,247,0.4)]`}>
                      {initials(activeContact.name)}
                    </div>
                    <div>
                      <div className="text-white font-medium leading-tight">{activeContact.name}</div>
                      <div className="text-[11px] text-purple-200/50">{activeContact.phone}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-purple-200/70">
                    <button className="p-2 rounded-full hover:bg-purple-500/20 hover:text-white transition-colors"><Video className="w-5 h-5" /></button>
                    <button className="p-2 rounded-full hover:bg-purple-500/20 hover:text-white transition-colors"><Phone className="w-5 h-5" /></button>
                    <button className="p-2 rounded-full hover:bg-purple-500/20 hover:text-white transition-colors"><Search className="w-5 h-5" /></button>
                    <button className="p-2 rounded-full hover:bg-red-500/20 hover:text-red-300 transition-colors"
                      title="Supprimer le contact" onClick={() => handleDeleteContact(activeContact.id)}>
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-12 py-4 space-y-1.5">
                  {activeMessages.length === 0 && (
                    <div className="flex justify-center mt-8">
                      <div className={`${PANEL_HEADER} text-purple-200/60 text-xs px-4 py-2 rounded-lg border ${BORDER}`}>
                        Aucun message. Dites bonjour à {activeContact.name} 👋
                      </div>
                    </div>
                  )}
                  {activeMessages.map((m) => (
                    <div key={m.id} className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[65%] px-3 py-2 rounded-2xl shadow-md relative ${
                        m.fromMe
                          ? "bg-gradient-to-br from-purple-600 to-fuchsia-700 text-white rounded-br-sm"
                          : "bg-[hsl(275_30%_15%)] text-white border border-purple-500/20 rounded-bl-sm"
                      }`}>
                        {/* Attachment rendering */}
                        {m.attachment?.kind === "image" && (
                          <a href={m.attachment.dataUrl} target="_blank" rel="noreferrer" className="block mb-1">
                            <img src={m.attachment.dataUrl} alt={m.attachment.name}
                              className="rounded-lg max-w-[260px] max-h-[260px] object-cover" />
                          </a>
                        )}
                        {m.attachment?.kind === "file" && (
                          <a href={m.attachment.dataUrl} download={m.attachment.name}
                            className="flex items-center gap-2 bg-white/10 hover:bg-white/15 rounded-lg px-3 py-2 mb-1 min-w-[200px] transition-colors">
                            <FileText className="w-7 h-7 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium truncate">{m.attachment.name}</div>
                              <div className="text-[10px] opacity-70">{formatBytes(m.attachment.size)}</div>
                            </div>
                          </a>
                        )}
                        {m.attachment?.kind === "audio" && (
                          <div className="mb-1">
                            <AudioBubble src={m.attachment.dataUrl} duration={m.attachment.duration} />
                          </div>
                        )}
                        {m.body && <p className="text-sm whitespace-pre-wrap pr-14">{m.body}</p>}
                        <span className={`${m.body ? "absolute bottom-1 right-2" : "block text-right mt-1"} text-[10px] text-white/60 flex items-center gap-1 ${m.body ? "" : "justify-end"}`}>
                          {formatTime(m.timestamp)}
                          {m.fromMe && (
                            m.status === "read" ? <CheckCheck className="w-3 h-3 text-cyan-300" />
                            : m.status === "delivered" ? <CheckCheck className="w-3 h-3" />
                            : <Check className="w-3 h-3" />
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Pending attachment preview */}
                {pendingAttachment && (
                  <div className={`px-4 py-2 ${PANEL_HEADER} border-t ${BORDER} flex items-center gap-3`}>
                    {pendingAttachment.kind === "image" ? (
                      <img src={pendingAttachment.dataUrl} className="w-12 h-12 rounded object-cover" />
                    ) : pendingAttachment.kind === "audio" ? (
                      <Mic className="w-6 h-6 text-purple-300" />
                    ) : (
                      <FileText className="w-6 h-6 text-purple-300" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{pendingAttachment.name}</div>
                      <div className="text-[11px] text-purple-200/50">{formatBytes(pendingAttachment.size)}</div>
                    </div>
                    <button onClick={() => setPendingAttachment(null)}
                      className="p-1.5 rounded-full hover:bg-red-500/20 text-purple-200/70 hover:text-red-300">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Composer */}
                <div className={`px-4 py-3 ${PANEL_HEADER} border-t ${BORDER} flex items-center gap-2`}>
                  {recording ? (
                    <>
                      <button onClick={() => stopRecording(true)}
                        className="text-red-300 hover:text-red-200 p-2 transition-colors" title="Annuler">
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <div className="flex-1 flex items-center gap-3 px-3">
                        <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-sm text-white font-mono">{formatDuration(recordSeconds)}</span>
                        <span className="text-xs text-purple-200/60">Enregistrement…</span>
                      </div>
                      <button onClick={() => stopRecording(false)}
                        className="text-white p-2.5 bg-gradient-to-r from-purple-500 to-fuchsia-600 hover:opacity-90 rounded-full shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                        title="Envoyer le vocal">
                        <Send className="w-5 h-5" />
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Emoji */}
                      <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                        <PopoverTrigger asChild>
                          <button className="text-purple-200/60 hover:text-white p-2 transition-colors" title="Émoji">
                            <Smile className="w-6 h-6" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="top" align="start"
                          className={`w-80 ${PANEL_HEADER} ${BORDER} text-white p-3`}>
                          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                            {EMOJI_GROUPS.map((g) => (
                              <div key={g.label}>
                                <div className="text-[10px] uppercase tracking-wider text-purple-200/50 mb-1.5">{g.label}</div>
                                <div className="flex flex-wrap gap-1">
                                  {g.emojis.map((e, i) => (
                                    <button key={i} onClick={() => insertEmoji(e)}
                                      className="text-xl w-8 h-8 rounded hover:bg-purple-500/20 transition-colors">
                                      {e}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>

                      {/* Joindre menu */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="text-purple-200/60 hover:text-white p-2 transition-colors" title="Joindre">
                            <Paperclip className="w-6 h-6" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="top" align="start"
                          className={`w-48 ${PANEL_HEADER} ${BORDER} text-white p-2`}>
                          <button
                            onClick={() => imageInputRef.current?.click()}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-purple-500/20 transition-colors text-left"
                          >
                            <ImageIcon className="w-5 h-5 text-purple-300" />
                            <span className="text-sm">Photo</span>
                          </button>
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-purple-500/20 transition-colors text-left"
                          >
                            <FileText className="w-5 h-5 text-purple-300" />
                            <span className="text-sm">Document</span>
                          </button>
                        </PopoverContent>
                      </Popover>
                      <input ref={imageInputRef} type="file" accept="image/*" hidden
                        onChange={(e) => handlePickFile(e, "image")} />
                      <input ref={fileInputRef} type="file" hidden
                        onChange={(e) => handlePickFile(e, "file")} />

                      <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder="Tapez un message"
                        className={`flex-1 ${INPUT_BG} text-white placeholder:text-purple-200/30 rounded-lg px-4 py-2.5 text-sm outline-none border ${BORDER} focus:border-purple-500/50 transition-colors`} />

                      {draft.trim() || pendingAttachment ? (
                        <button onClick={() => handleSend()} title="Envoyer"
                          className="text-white p-2.5 bg-gradient-to-r from-purple-500 to-fuchsia-600 hover:opacity-90 rounded-full shadow-[0_0_15px_rgba(168,85,247,0.5)] transition-opacity">
                          <Send className="w-5 h-5" />
                        </button>
                      ) : (
                        <button onClick={startRecording}
                          className="text-purple-200/60 hover:text-white p-2 transition-colors" title="Enregistrer un vocal">
                          <Mic className="w-6 h-6" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
