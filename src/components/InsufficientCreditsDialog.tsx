import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Zap, Coins } from "lucide-react";

export interface InsufficientCreditsInfo {
  balance: number;
  required: number;
  missing: number;
  action?: string | null;
  model?: string | null;
  breakdown?: Record<string, unknown> | null;
  message?: string;
}

const ACTION_LABELS: Record<string, string> = {
  chat: "Message dans le chat",
  "voice-chat": "Réponse vocale",
  "voice-tts": "Synthèse vocale (TTS)",
  "voice-transcribe": "Transcription audio",
  "analyze-mood": "Analyse d'humeur",
  "weekly-insight": "Insights hebdomadaires",
};

export function InsufficientCreditsDialog({
  open,
  info,
  onClose,
}: {
  open: boolean;
  info: InsufficientCreditsInfo | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  if (!info) return null;

  const actionLabel = (info.action && ACTION_LABELS[info.action]) || "Cette action";
  const ratio = info.required > 0
    ? Math.min(100, Math.round((info.balance / info.required) * 100))
    : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle>Crédits insuffisants</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            {actionLabel} nécessite plus de crédits que ce dont vous disposez.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Coins className="h-4 w-4" />
                Vos crédits
              </span>
              <span className="font-semibold">{info.balance}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Zap className="h-4 w-4" />
                Requis pour cette requête
              </span>
              <span className="font-semibold">{info.required}</span>
            </div>
            <Progress value={ratio} className="h-2" />
            <div className="flex items-center justify-between text-sm pt-1 border-t">
              <span className="text-destructive font-medium">Il vous manque</span>
              <span className="text-destructive font-bold text-lg">{info.missing}</span>
            </div>
          </div>

          {info.model && (
            <p className="text-xs text-muted-foreground text-center">
              Modèle utilisé : <code className="bg-muted px-1 py-0.5 rounded">{info.model}</code>
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="sm:flex-1">
            Annuler
          </Button>
          <Button onClick={() => { onClose(); navigate("/billing"); }} className="sm:flex-1">
            Acheter des crédits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}