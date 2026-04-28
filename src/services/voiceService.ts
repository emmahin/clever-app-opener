import { supabase } from "@/integrations/supabase/client";

export interface IVoiceService {
  /** Demande la permission micro et démarre l'enregistrement. */
  startRecording(): Promise<void>;
  /** Arrête, transcrit, retourne le texte. */
  stopAndTranscribe(): Promise<string>;
  /** True si en cours d'enregistrement. */
  isRecording(): boolean;
  /** Retourne le MediaStream actif (pour analyse audio externe). */
  getStream(): MediaStream | null;
}

class WebVoiceService implements IVoiceService {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  isRecording() {
    return this.mediaRecorder?.state === "recording";
  }

  getStream() {
    return this.stream;
  }

  async startRecording() {
    this.chunks = [];
    // Contraintes audio standard, larges et compatibles tous navigateurs.
    // Le filtrage avancé (high-pass 120 Hz / low-pass 7 kHz) est déjà
    // réalisé en aval via Web Audio API dans TwinVoiceProvider, donc on
    // garde ici uniquement les flags STANDARD qui ne risquent pas de
    // déclencher un OverconstrainedError sur certains navigateurs.
    //
    // Stratégie de repli : si la première tentative échoue (contraintes
    // refusées par le device), on retombe sur `audio: true` brut.
    const idealConstraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(idealConstraints);
    } catch (err) {
      console.warn("[voiceService] constraints rejected, falling back to audio:true", err);
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    // Bitrate plus élevé que la valeur par défaut (~32 kbps) pour préserver
    // les consonnes (s, ch, f, t) qui sont les premières détruites par la
    // compression. Whisper a besoin de ces fréquences pour bien transcrire.
    let options: MediaRecorderOptions | undefined;
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ];
    for (const mt of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(mt)) {
        options = { mimeType: mt, audioBitsPerSecond: 96000 };
        break;
      }
    }
    this.mediaRecorder = options ? new MediaRecorder(this.stream, options) : new MediaRecorder(this.stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
  }

  async stopAndTranscribe(): Promise<string> {
    if (!this.mediaRecorder) throw new Error("Enregistrement non démarré.");
    const stopped = new Promise<void>((resolve) => {
      this.mediaRecorder!.onstop = () => resolve();
    });
    this.mediaRecorder.stop();
    await stopped;
    this.stream?.getTracks().forEach((t) => t.stop());

    const recordedType = this.mediaRecorder.mimeType || "audio/webm";
    const blob = new Blob(this.chunks, { type: recordedType });
    const base64 = await blobToBase64(blob);
    const { data, error } = await supabase.functions.invoke("voice-transcribe", {
      body: { audio: base64 },
    });
    if (error) throw error;
    return (data?.text as string) ?? "";
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const result = r.result as string;
      resolve(result.split(",")[1]);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export const webVoiceService: IVoiceService = new WebVoiceService();
