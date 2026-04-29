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
  /** Flux brut du micro (à couper aussi à la fin). */
  private rawStream: MediaStream | null = null;
  /** Contexte WebAudio utilisé pour la chaîne d'isolation vocale. */
  private audioCtx: AudioContext | null = null;

  isRecording() {
    return this.mediaRecorder?.state === "recording";
  }

  getStream() {
    // On expose le flux NETTOYÉ pour que toute analyse externe
    // (VAD, jauge, barge-in) bénéficie aussi du filtrage.
    return this.stream;
  }

  async startRecording() {
    this.chunks = [];
    // ─── Étape 1 : capter le micro avec un MAX d'isolation côté OS/driver ──
    // On essaie en cascade des contraintes de + en + agressives, en retombant
    // sur des flags standards si le device refuse (OverconstrainedError).
    const cascade: MediaStreamConstraints[] = [
      // Idéal : flags Chromium étendus + mono 16kHz + voiceIsolation (Chrome 121+)
      {
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          // Chromium proposera "voiceIsolation" si l'OS le supporte (macOS/ChromeOS).
          // Cette propriété n'est pas standard → on cast en any pour la passer.
          voiceIsolation: { ideal: true },
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
          sampleSize: { ideal: 16 },
        } as unknown as MediaTrackConstraints,
      },
      // Bon compromis : flags standards uniquement.
      {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      },
      // Filet de sécurité.
      { audio: true },
    ];
    let raw: MediaStream | null = null;
    for (const c of cascade) {
      try {
        raw = await navigator.mediaDevices.getUserMedia(c);
        break;
      } catch (err) {
        console.warn("[voiceService] constraints rejected, trying next:", err);
      }
    }
    if (!raw) throw new Error("Aucune configuration micro acceptée par le navigateur.");
    this.rawStream = raw;

    // ─── Étape 2 : chaîne WebAudio d'isolation vocale appliquée AU SIGNAL
    //              ENREGISTRÉ (Whisper reçoit donc un audio déjà nettoyé).
    // Pipeline : src → highpass(100Hz) → lowpass(8kHz) → presencePeaking(2.5kHz)
    //          → noiseGate(via DynamicsCompressor en mode expander-like)
    //          → finalCompressor → destination MediaStream → MediaRecorder.
    let recordableStream: MediaStream = raw;
    try {
      const Ctx: typeof AudioContext = (window.AudioContext || (window as any).webkitAudioContext);
      const ctx = new Ctx();
      this.audioCtx = ctx;
      const src = ctx.createMediaStreamSource(raw);

      // 1) High-pass 100 Hz : retire grondements/vent/ronflement secteur (50/60 Hz).
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 100;
      highpass.Q.value = 0.707;

      // 2) Low-pass 8 kHz : retire sifflements/bruit blanc/aigus parasites.
      //    La voix intelligible va jusqu'à ~5 kHz, on garde un peu de marge
      //    pour les consonnes (s/ch/f).
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 8000;
      lowpass.Q.value = 0.707;

      // 3) Boost de présence à 2.5 kHz (intelligibilité des consonnes).
      const presence = ctx.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.value = 2500;
      presence.Q.value = 1.2;
      presence.gain.value = 4; // +4 dB de présence

      // 4) Compresseur agressif = "noise gate + leveler" simple :
      //    - threshold bas (-45 dB) → tout son sous ce seuil est fortement réduit
      //    - ratio élevé (12:1)    → écrase les bruits faibles, laisse passer la voix
      //    - knee dur (0)          → coupure nette
      //    - attack très rapide    → pas de tail audible
      //    - release modéré        → évite le pompage
      const gate = ctx.createDynamicsCompressor();
      gate.threshold.value = -45;
      gate.knee.value = 0;
      gate.ratio.value = 12;
      gate.attack.value = 0.002;
      gate.release.value = 0.12;

      // 5) Compresseur final doux pour égaliser le volume final.
      const leveler = ctx.createDynamicsCompressor();
      leveler.threshold.value = -22;
      leveler.knee.value = 6;
      leveler.ratio.value = 3;
      leveler.attack.value = 0.005;
      leveler.release.value = 0.18;

      // 6) Léger gain de make-up (le gate + filtres baissent le niveau global).
      const makeup = ctx.createGain();
      makeup.gain.value = 1.6;

      const dest = ctx.createMediaStreamDestination();
      src.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(presence);
      presence.connect(gate);
      gate.connect(leveler);
      leveler.connect(makeup);
      makeup.connect(dest);

      recordableStream = dest.stream;
      console.debug("[voiceService] voice-isolation chain ENABLED");
    } catch (err) {
      // En cas de souci WebAudio : on enregistre le flux brut, ça reste fonctionnel.
      console.warn("[voiceService] WebAudio isolation chain failed, recording raw stream", err);
    }

    this.stream = recordableStream;
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
    this.mediaRecorder = options
      ? new MediaRecorder(this.stream, options)
      : new MediaRecorder(this.stream);
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
    // Ferme TOUT : flux nettoyé + flux brut + AudioContext.
    try { this.stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { this.rawStream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { await this.audioCtx?.close(); } catch { /* ignore */ }
    this.rawStream = null;
    this.audioCtx = null;

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
