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
    // Contraintes audio optimisées pour ISOLER la voix principale (proche du micro)
    // et IGNORER les sons parasites (vent, voix d'arrière-plan, TV, conversation
    // dans une autre pièce…).
    //
    //  - echoCancellation        : évite que la voix de Lia rentre dans le micro
    //  - noiseSuppression        : nettoie le bruit de fond constant (vent, ventilo)
    //  - autoGainControl: FALSE  : volontairement désactivé. L'AGC remonte le
    //    volume quand on se tait → il amplifie alors les voix lointaines et le
    //    vent. En le coupant, seul le signal réellement fort (ta voix proche)
    //    reste audible pour le STT.
    //  - voiceIsolation          : extension Chrome/Edge récente — isole
    //    spécifiquement la voix la plus proche du micro (gating spatial).
    //  - googHighpassFilter      : extension Chrome — coupe les très basses
    //    fréquences (vent, grondements).
    //  - channelCount 1 + sampleRate 48k : mono, qualité STT optimale.
    // Ces flags Chrome/Edge ne sont pas standard mais améliorent fortement
    // la qualité quand ils sont disponibles ; ignorés silencieusement sinon.
    const advanced: MediaTrackConstraints[] = [
      {
        googEchoCancellation: true,
        googNoiseSuppression: true,
        googHighpassFilter: true,
        googAutoGainControl: false,
        googExperimentalNoiseSuppression: true,
      } as unknown as MediaTrackConstraints,
    ];

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: ({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: 1,
        sampleRate: 48000,
        voiceIsolation: true,
        advanced,
      } as unknown) as MediaTrackConstraints,
    });

    // Si le navigateur supporte les contraintes avancées, on tente d'appliquer
    // dynamiquement voiceIsolation + désactivation AGC sur la piste active
    // (certains navigateurs n'honorent les flags que via applyConstraints).
    try {
      const track = this.stream.getAudioTracks()[0];
      if (track && typeof track.applyConstraints === "function") {
        await track.applyConstraints(({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          voiceIsolation: true,
        } as unknown) as MediaTrackConstraints).catch(() => { /* ignoré */ });
      }
    } catch { /* ignore */ }
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
