import { useState, useEffect } from "react";
import { Sidebar } from "@/components/chatbot/Sidebar";
import { Header } from "@/components/chatbot/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  Send,
  Plus,
  Trash2,
  Calendar,
  FileText,
  Phone,
  Clock,
  ExternalLink,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Template {
  id: string;
  name: string;
  body: string;
}

interface ScheduledMessage {
  id: string;
  phone: string;
  message: string;
  sendAt: string; // ISO datetime
  status: "pending" | "sent" | "cancelled";
  createdAt: string;
}

const LS_TEMPLATES = "wa_templates";
const LS_SCHEDULED = "wa_scheduled";

function loadTemplates(): Template[] {
  try {
    return JSON.parse(localStorage.getItem(LS_TEMPLATES) || "[]");
  } catch {
    return [];
  }
}
function saveTemplates(t: Template[]) {
  localStorage.setItem(LS_TEMPLATES, JSON.stringify(t));
}
function loadScheduled(): ScheduledMessage[] {
  try {
    return JSON.parse(localStorage.getItem(LS_SCHEDULED) || "[]");
  } catch {
    return [];
  }
}
function saveScheduled(s: ScheduledMessage[]) {
  localStorage.setItem(LS_SCHEDULED, JSON.stringify(s));
}

function applyVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function extractVariables(template: string): string[] {
  const matches = template.match(/\{(\w+)\}/g) || [];
  return Array.from(new Set(matches.map((m) => m.slice(1, -1))));
}

function buildWaLink(phone: string, message: string): string {
  const cleanPhone = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export default function WhatsAppPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>([]);

  // Send simple
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [scheduleAt, setScheduleAt] = useState("");

  // Template editor
  const [tplName, setTplName] = useState("");
  const [tplBody, setTplBody] = useState("");

  useEffect(() => {
    setTemplates(loadTemplates());
    setScheduled(loadScheduled());
  }, []);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const activeBody = selectedTemplate?.body ?? message;
  const detectedVars = extractVariables(activeBody);
  const finalMessage = applyVariables(activeBody, variables);

  const handleSendNow = () => {
    if (!phone.trim() || !finalMessage.trim()) {
      toast({ title: "Champs requis", description: "Numéro et message obligatoires." });
      return;
    }
    const url = buildWaLink(phone, finalMessage);
    window.open(url, "_blank");
    toast({ title: "WhatsApp ouvert", description: "Cliquez sur envoyer dans WhatsApp." });
  };

  const handleSchedule = () => {
    if (!phone.trim() || !finalMessage.trim() || !scheduleAt) {
      toast({ title: "Champs requis", description: "Numéro, message et date requis." });
      return;
    }
    const newMsg: ScheduledMessage = {
      id: crypto.randomUUID(),
      phone: phone.trim(),
      message: finalMessage,
      sendAt: new Date(scheduleAt).toISOString(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    const next = [...scheduled, newMsg];
    setScheduled(next);
    saveScheduled(next);
    toast({ title: "Message programmé", description: `Envoi prévu à ${new Date(scheduleAt).toLocaleString("fr-FR")}` });
    setScheduleAt("");
  };

  const handleSaveTemplate = () => {
    if (!tplName.trim() || !tplBody.trim()) return;
    const tpl: Template = { id: crypto.randomUUID(), name: tplName.trim(), body: tplBody };
    const next = [...templates, tpl];
    setTemplates(next);
    saveTemplates(next);
    setTplName("");
    setTplBody("");
    toast({ title: "Template enregistré" });
  };

  const handleDeleteTemplate = (id: string) => {
    const next = templates.filter((t) => t.id !== id);
    setTemplates(next);
    saveTemplates(next);
    if (selectedTemplateId === id) setSelectedTemplateId("");
  };

  const handleCancelScheduled = (id: string) => {
    const next = scheduled.filter((s) => s.id !== id);
    setScheduled(next);
    saveScheduled(next);
  };

  const handleCopyLink = (s: ScheduledMessage) => {
    navigator.clipboard.writeText(buildWaLink(s.phone, s.message));
    toast({ title: "Lien copié" });
  };

  return (
    <div
      className="min-h-screen text-foreground overflow-hidden"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 100% 80% at 20% 100%, hsl(280 90% 40%) 0%, transparent 55%), radial-gradient(ellipse 90% 70% at 80% 90%, hsl(295 85% 35%) 0%, transparent 55%), linear-gradient(180deg, hsl(0 0% 0%) 0%, hsl(275 60% 8%) 55%, hsl(270 75% 22%) 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      <Sidebar />
      <Header onNewChat={() => {}} />

      <main className="ml-[72px] pt-14 min-h-screen px-6 py-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {/* Title */}
          <div className="mb-8">
            <h1 className="text-3xl font-semibold flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-glow">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              WhatsApp
            </h1>
            <p className="text-muted-foreground text-sm mt-2">
              Envoyez des messages, créez des templates et programmez des envois automatiques.
            </p>
          </div>

          <Tabs defaultValue="send" className="w-full">
            <TabsList className="glass">
              <TabsTrigger value="send"><Send className="w-4 h-4 mr-2" />Envoi</TabsTrigger>
              <TabsTrigger value="templates"><FileText className="w-4 h-4 mr-2" />Templates</TabsTrigger>
              <TabsTrigger value="scheduled"><Calendar className="w-4 h-4 mr-2" />Programmés <Badge variant="secondary" className="ml-2">{scheduled.filter((s) => s.status === "pending").length}</Badge></TabsTrigger>
            </TabsList>

            {/* SEND TAB */}
            <TabsContent value="send" className="mt-6">
              <div className="grid md:grid-cols-2 gap-6">
                <Card className="glass p-6">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-primary" /> Destinataire & message
                  </h2>

                  <label className="text-xs text-muted-foreground">Numéro (avec indicatif, ex: +33612345678)</label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+33612345678"
                    className="mb-4 mt-1"
                  />

                  <label className="text-xs text-muted-foreground">Template (optionnel)</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => {
                      setSelectedTemplateId(e.target.value);
                      setVariables({});
                    }}
                    className="w-full mt-1 mb-4 rounded-md bg-input border border-border px-3 py-2 text-sm"
                  >
                    <option value="">— Message libre —</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>

                  {!selectedTemplate && (
                    <>
                      <label className="text-xs text-muted-foreground">Message</label>
                      <Textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Bonjour, ..."
                        rows={5}
                        className="mt-1"
                      />
                    </>
                  )}

                  {selectedTemplate && detectedVars.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Variables du template</label>
                      {detectedVars.map((v) => (
                        <Input
                          key={v}
                          value={variables[v] ?? ""}
                          onChange={(e) => setVariables((prev) => ({ ...prev, [v]: e.target.value }))}
                          placeholder={`{${v}}`}
                        />
                      ))}
                    </div>
                  )}
                </Card>

                <Card className="glass p-6">
                  <h2 className="font-semibold mb-4">Aperçu & actions</h2>

                  <div className="rounded-lg bg-black/40 border border-border p-4 mb-4 min-h-[120px] whitespace-pre-wrap text-sm">
                    {finalMessage || <span className="text-muted-foreground italic">Aperçu du message...</span>}
                  </div>

                  <Button
                    onClick={handleSendNow}
                    className="w-full mb-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-90"
                  >
                    <Send className="w-4 h-4 mr-2" /> Envoyer maintenant (ouvre WhatsApp)
                  </Button>

                  <div className="border-t border-border pt-4">
                    <label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Programmer un envoi
                    </label>
                    <Input
                      type="datetime-local"
                      value={scheduleAt}
                      onChange={(e) => setScheduleAt(e.target.value)}
                      className="mt-1 mb-3"
                    />
                    <Button onClick={handleSchedule} variant="outline" className="w-full">
                      <Calendar className="w-4 h-4 mr-2" /> Programmer
                    </Button>
                  </div>
                </Card>
              </div>
            </TabsContent>

            {/* TEMPLATES TAB */}
            <TabsContent value="templates" className="mt-6">
              <div className="grid md:grid-cols-2 gap-6">
                <Card className="glass p-6">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-primary" /> Nouveau template
                  </h2>
                  <label className="text-xs text-muted-foreground">Nom</label>
                  <Input
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    placeholder="Ex: Rappel rendez-vous"
                    className="mb-4 mt-1"
                  />
                  <label className="text-xs text-muted-foreground">
                    Corps (utilisez {"{variable}"} pour les champs dynamiques)
                  </label>
                  <Textarea
                    value={tplBody}
                    onChange={(e) => setTplBody(e.target.value)}
                    placeholder="Bonjour {nom}, votre rendez-vous est prévu le {date} à {heure}."
                    rows={6}
                    className="mt-1 mb-4"
                  />
                  {extractVariables(tplBody).length > 0 && (
                    <div className="text-xs text-muted-foreground mb-4">
                      Variables détectées :{" "}
                      {extractVariables(tplBody).map((v) => (
                        <Badge key={v} variant="secondary" className="mr-1">{`{${v}}`}</Badge>
                      ))}
                    </div>
                  )}
                  <Button onClick={handleSaveTemplate} className="w-full">
                    <Plus className="w-4 h-4 mr-2" /> Enregistrer
                  </Button>
                </Card>

                <Card className="glass p-6">
                  <h2 className="font-semibold mb-4">Mes templates ({templates.length})</h2>
                  {templates.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Aucun template enregistré.</p>
                  ) : (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
                      {templates.map((t) => (
                        <div key={t.id} className="rounded-lg border border-border bg-black/30 p-3">
                          <div className="flex items-start justify-between mb-1">
                            <span className="font-medium text-sm">{t.name}</span>
                            <button onClick={() => handleDeleteTemplate(t.id)} className="text-destructive hover:opacity-80">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">{t.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </TabsContent>

            {/* SCHEDULED TAB */}
            <TabsContent value="scheduled" className="mt-6">
              <Card className="glass p-6">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" /> Messages programmés
                </h2>
                {scheduled.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Aucun message programmé.</p>
                ) : (
                  <div className="space-y-3">
                    {scheduled
                      .sort((a, b) => new Date(a.sendAt).getTime() - new Date(b.sendAt).getTime())
                      .map((s) => {
                        const due = new Date(s.sendAt) <= new Date();
                        return (
                          <div key={s.id} className="rounded-lg border border-border bg-black/30 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <Phone className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-sm font-medium">{s.phone}</span>
                                  {due ? (
                                    <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/40">
                                      <CheckCircle2 className="w-3 h-3 mr-1" /> À envoyer
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary">
                                      <Clock className="w-3 h-3 mr-1" />
                                      {new Date(s.sendAt).toLocaleString("fr-FR")}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-2">{s.message}</p>
                              </div>
                              <div className="flex flex-col gap-2 shrink-0">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(buildWaLink(s.phone, s.message), "_blank")}
                                >
                                  <ExternalLink className="w-3 h-3 mr-1" /> Ouvrir
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleCopyLink(s)}>
                                  <Copy className="w-3 h-3 mr-1" /> Lien
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleCancelScheduled(s.id)}>
                                  <Trash2 className="w-3 h-3 mr-1" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                <div className="mt-6 p-4 rounded-lg bg-primary/10 border border-primary/30 text-xs text-muted-foreground">
                  <strong className="text-foreground">💡 Automatisation locale :</strong> les messages programmés sont stockés dans votre navigateur. Pour un envoi 100 % automatique, branchez votre script Selenium local sur cette liste (clé localStorage <code className="text-primary">wa_scheduled</code>) ou exportez-la en JSON.
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
