import { useState, useEffect, useRef, useMemo } from "react";
import { Sidebar as AppSidebar } from "@/components/chatbot/Sidebar";
import {
  Search, MoreVertical, Phone, Video, Send, Paperclip, Smile, Mic, Plus,
  MessageCircle, Check, CheckCheck, X, Archive, Filter,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

interface Contact {
  id: string;
  name: string;
  phone: string;
  avatarColor: string;
  about?: string;
}

interface Message {
  id: string;
  contactId: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  status: "sent" | "delivered" | "read";
}

const LS_CONTACTS = "wa_contacts";
const LS_MESSAGES = "wa_messages";

const AVATAR_COLORS = [
  "from-emerald-500 to-teal-600",
  "from-fuchsia-500 to-purple-600",
  "from-blue-500 to-indigo-600",
  "from-orange-500 to-red-600",
  "from-pink-500 to-rose-600",
  "from-cyan-500 to-sky-600",
  "from-amber-500 to-yellow-600",
  "from-violet-500 to-purple-700",
];

function loadContacts(): Contact[] {
  try { return JSON.parse(localStorage.getItem(LS_CONTACTS) || "[]"); } catch { return []; }
}
function loadMessages(): Message[] {
  try { return JSON.parse(localStorage.getItem(LS_MESSAGES) || "[]"); } catch { return []; }
}
function saveContacts(c: Contact[]) { localStorage.setItem(LS_CONTACTS, JSON.stringify(c)); }
function saveMessages(m: Message[]) { localStorage.setItem(LS_MESSAGES, JSON.stringify(m)); }

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
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

export default function WhatsAppPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAbout, setNewAbout] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setContacts(loadContacts());
    setMessages(loadMessages());
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
      id: crypto.randomUUID(),
      name: newName.trim(),
      phone: newPhone.trim(),
      avatarColor: AVATAR_COLORS[contacts.length % AVATAR_COLORS.length],
      about: newAbout.trim() || "Disponible",
    };
    const next = [...contacts, c];
    setContacts(next);
    saveContacts(next);
    setNewName(""); setNewPhone(""); setNewAbout("");
    setAddOpen(false);
    setActiveId(c.id);
  };

  const handleDeleteContact = (id: string) => {
    const nextContacts = contacts.filter((c) => c.id !== id);
    const nextMessages = messages.filter((m) => m.contactId !== id);
    setContacts(nextContacts); setMessages(nextMessages);
    saveContacts(nextContacts); saveMessages(nextMessages);
    if (activeId === id) setActiveId(null);
  };

  const handleSend = () => {
    if (!draft.trim() || !activeId) return;
    const msg: Message = {
      id: crypto.randomUUID(),
      contactId: activeId,
      body: draft.trim(),
      fromMe: true,
      timestamp: Date.now(),
      status: "sent",
    };
    const next = [...messages, msg];
    setMessages(next); saveMessages(next);
    setDraft("");
    setTimeout(() => {
      setMessages((cur) => {
        const updated = cur.map((m) => (m.id === msg.id ? { ...m, status: "delivered" as const } : m));
        saveMessages(updated);
        return updated;
      });
    }, 800);
  };

  return (
    <div className="min-h-screen bg-[#0b141a] text-foreground overflow-hidden">
      <AppSidebar />
      <div className="ml-[72px] h-[60px] bg-gradient-to-r from-emerald-700 to-teal-700" />

      <main className="ml-[72px] -mt-[20px] px-4 pb-4 h-[calc(100vh-40px)]">
        <div className="h-full max-w-[1600px] mx-auto rounded-lg overflow-hidden shadow-2xl flex bg-[#111b21] border border-black/40">
          {/* LEFT */}
          <aside className="w-[400px] flex flex-col border-r border-white/5">
            <div className="h-16 px-4 flex items-center justify-between bg-[#202c33]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <span className="text-white font-semibold">M</span>
                </div>
                <span className="text-sm font-medium text-white/90">Mon compte</span>
              </div>
              <div className="flex items-center gap-1 text-white/70">
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                  <DialogTrigger asChild>
                    <button title="Nouveau contact" className="p-2 rounded-full hover:bg-white/10">
                      <Plus className="w-5 h-5" />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="bg-[#202c33] border-white/10 text-white">
                    <DialogHeader><DialogTitle>Nouveau contact</DialogTitle></DialogHeader>
                    <div className="space-y-3 py-2">
                      <div>
                        <label className="text-xs text-white/60">Nom</label>
                        <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                          placeholder="Marie Dupont" className="mt-1 bg-[#2a3942] border-white/10 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-white/60">Téléphone</label>
                        <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                          placeholder="+33 6 12 34 56 78" className="mt-1 bg-[#2a3942] border-white/10 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-white/60">À propos (optionnel)</label>
                        <Input value={newAbout} onChange={(e) => setNewAbout(e.target.value)}
                          placeholder="Disponible" className="mt-1 bg-[#2a3942] border-white/10 text-white" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleAddContact} className="bg-emerald-600 hover:bg-emerald-700">
                        Ajouter
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <button className="p-2 rounded-full hover:bg-white/10"><MoreVertical className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="p-2 bg-[#111b21]">
              <div className="flex items-center gap-2 bg-[#202c33] rounded-lg px-3 py-1.5">
                <Search className="w-4 h-4 text-white/50" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher ou démarrer une discussion"
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 outline-none" />
                <Filter className="w-4 h-4 text-white/40" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredContacts.length === 0 && (
                <div className="p-8 text-center text-white/40 text-sm">
                  <Archive className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  Aucun contact. Cliquez sur <Plus className="w-3 h-3 inline mx-1" /> pour en ajouter.
                </div>
              )}
              {filteredContacts.map((c) => {
                const last = lastMessageOf(c.id);
                const isActive = c.id === activeId;
                return (
                  <button key={c.id} onClick={() => setActiveId(c.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 border-b border-white/5 text-left transition-colors ${
                      isActive ? "bg-[#2a3942]" : "hover:bg-[#202c33]"
                    }`}>
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${c.avatarColor} flex items-center justify-center text-white font-semibold shrink-0`}>
                      {initials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-white/90 font-medium truncate">{c.name}</span>
                        {last && <span className="text-[11px] text-white/40 shrink-0 ml-2">{formatTime(last.timestamp)}</span>}
                      </div>
                      <div className="text-xs text-white/50 truncate">
                        {last ? (
                          <>
                            {last.fromMe && <CheckCheck className="w-3 h-3 inline mr-1 text-sky-400" />}
                            {last.body}
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
            backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'><g fill='%23ffffff' fill-opacity='0.02'><circle cx='30' cy='30' r='1.5'/></g></svg>")`,
            backgroundColor: "#0b141a",
          }}>
            {!activeContact ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                <div className="w-32 h-32 rounded-full bg-[#202c33] flex items-center justify-center mb-6">
                  <MessageCircle className="w-16 h-16 text-white/30" />
                </div>
                <h2 className="text-2xl font-light text-white/80 mb-2">WhatsApp Web</h2>
                <p className="text-sm text-white/50 max-w-md">
                  Sélectionnez un contact pour commencer à discuter, ou ajoutez-en un nouveau via le bouton +.
                </p>
                <p className="text-xs text-white/30 mt-8 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Connecté · Messages stockés localement
                </p>
              </div>
            ) : (
              <>
                <div className="h-16 px-4 flex items-center justify-between bg-[#202c33] border-l border-white/5">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${activeContact.avatarColor} flex items-center justify-center text-white font-semibold`}>
                      {initials(activeContact.name)}
                    </div>
                    <div>
                      <div className="text-white/90 font-medium leading-tight">{activeContact.name}</div>
                      <div className="text-[11px] text-white/50">{activeContact.phone}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-white/70">
                    <button className="p-2 rounded-full hover:bg-white/10"><Video className="w-5 h-5" /></button>
                    <button className="p-2 rounded-full hover:bg-white/10"><Phone className="w-5 h-5" /></button>
                    <button className="p-2 rounded-full hover:bg-white/10"><Search className="w-5 h-5" /></button>
                    <button className="p-2 rounded-full hover:bg-white/10" title="Supprimer le contact"
                      onClick={() => handleDeleteContact(activeContact.id)}>
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-12 py-4 space-y-1">
                  {activeMessages.length === 0 && (
                    <div className="flex justify-center mt-8">
                      <div className="bg-[#202c33] text-white/60 text-xs px-4 py-2 rounded-lg">
                        Aucun message. Dites bonjour à {activeContact.name} 👋
                      </div>
                    </div>
                  )}
                  {activeMessages.map((m) => (
                    <div key={m.id} className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[65%] px-3 py-1.5 rounded-lg shadow-sm relative ${
                        m.fromMe ? "bg-[#005c4b] text-white" : "bg-[#202c33] text-white"
                      }`}>
                        <p className="text-sm whitespace-pre-wrap pr-14">{m.body}</p>
                        <span className="absolute bottom-1 right-2 text-[10px] text-white/50 flex items-center gap-1">
                          {formatTime(m.timestamp)}
                          {m.fromMe && (
                            m.status === "read" ? <CheckCheck className="w-3 h-3 text-sky-400" />
                            : m.status === "delivered" ? <CheckCheck className="w-3 h-3" />
                            : <Check className="w-3 h-3" />
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div className="px-4 py-3 bg-[#202c33] flex items-center gap-3">
                  <button className="text-white/60 hover:text-white p-2"><Smile className="w-6 h-6" /></button>
                  <button className="text-white/60 hover:text-white p-2"><Paperclip className="w-6 h-6" /></button>
                  <input value={draft} onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Tapez un message"
                    className="flex-1 bg-[#2a3942] text-white placeholder:text-white/40 rounded-lg px-4 py-2.5 text-sm outline-none" />
                  {draft.trim() ? (
                    <button onClick={handleSend} title="Envoyer"
                      className="text-white/80 hover:text-white p-2 bg-emerald-600 hover:bg-emerald-700 rounded-full">
                      <Send className="w-5 h-5" />
                    </button>
                  ) : (
                    <button className="text-white/60 hover:text-white p-2"><Mic className="w-6 h-6" /></button>
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
