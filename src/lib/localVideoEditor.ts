/**
 * Moteur de montage vidéo 100 % local — 0 token.
 *
 * Prend l'état actuel de la timeline + une commande utilisateur en français,
 * et renvoie une liste d'actions à appliquer (mêmes types que video-editor-agent).
 *
 * Si la commande n'est pas reconnue, renvoie { actions: [], unrecognized: true }
 * pour que l'UI propose un fallback IA.
 */

export type LocalAction =
  | { type: "set_format"; preset: "youtube" | "reels" }
  | { type: "trim"; clipId: string; inPoint?: number; outPoint?: number }
  | { type: "reorder"; clipId: string; toIndex: number }
  | { type: "remove_clip"; clipId: string }
  | { type: "add_text"; clipId: string; text: string; x?: number; y?: number; size?: number; color?: string }
  | { type: "remove_text"; clipId: string; overlayId: string };

export interface LocalClipState {
  id: string;
  name: string;
  duration: number;
  inPoint: number;
  outPoint: number;
  overlays: { id: string; text: string }[];
}
export interface LocalState {
  preset: "youtube" | "reels";
  clips: LocalClipState[];
  audios: { id: string; title: string; kind: string }[];
}

export interface LocalResult {
  actions: LocalAction[];
  rulesApplied: string[];
  stats: {
    clipsCount: number;
    clipsTrimmed: number;
    textsAdded: number;
    reordered: number;
    removed: number;
    formatChanged: boolean;
    preset: "youtube" | "reels";
    totalDurationBefore: number;
    totalDurationAfter: number;
  };
  unrecognized?: boolean;
  command: string;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Cherche un index de clip à partir du texte (« clip 1 », « premier clip », « le 2 »…). */
function findClipIndex(text: string, clips: LocalClipState[]): number {
  const t = norm(text);
  if (/(premier|1er|1 ?er)\b|\bclip 1\b|\bn°? ?1\b/.test(t)) return 0;
  if (/(deuxieme|second|2eme|2e)\b|\bclip 2\b|\bn°? ?2\b/.test(t)) return 1;
  if (/(troisieme|3eme|3e)\b|\bclip 3\b|\bn°? ?3\b/.test(t)) return 2;
  if (/(quatrieme|4eme|4e)\b|\bclip 4\b|\bn°? ?4\b/.test(t)) return 3;
  if (/(cinquieme|5eme|5e)\b|\bclip 5\b|\bn°? ?5\b/.test(t)) return 4;
  if (/\bdernier\b/.test(t)) return clips.length - 1;
  const m = t.match(/clip\s*(\d+)/);
  if (m) return parseInt(m[1], 10) - 1;
  return -1;
}

/** Extrait un nombre de secondes d'une expression (« 5s », « 5 secondes », « à 5 »). */
function extractSeconds(text: string): number | null {
  const m = norm(text).match(/(\d+(?:[.,]\d+)?)\s*(s|sec|secondes?)?/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(",", "."));
  return isFinite(v) ? v : null;
}

/**
 * Parse la commande utilisateur et produit des actions sans appel IA.
 */
export function parseLocalCommand(input: string, state: LocalState): LocalResult {
  const cmd = input.trim();
  const t = norm(cmd);
  const actions: LocalAction[] = [];
  const rulesApplied: string[] = [];

  let formatChanged = false;
  let clipsTrimmed = 0;
  let textsAdded = 0;
  let reordered = 0;
  let removed = 0;

  const totalBefore = state.clips.reduce(
    (s, c) => s + Math.max(0, c.outPoint - c.inPoint),
    0,
  );

  // ---- 1. Changement de format ----
  if (/\b(reels?|shorts?|vertical|9:?16|tiktok|insta)\b/.test(t) &&
      /(passe|format|mets?|change)/.test(t)) {
    actions.push({ type: "set_format", preset: "reels" });
    rulesApplied.push("Format → Reels (9:16)");
    formatChanged = true;
  } else if (/\b(youtube|horizontal|16:?9|paysage)\b/.test(t) &&
             /(passe|format|mets?|change)/.test(t)) {
    actions.push({ type: "set_format", preset: "youtube" });
    rulesApplied.push("Format → YouTube (16:9)");
    formatChanged = true;
  }

  // ---- 2. Suppression d'un clip ----
  if (/(supprime|enleve|retire|efface)/.test(t) && /clip|premier|dernier|deuxieme|troisieme/.test(t)) {
    const idx = findClipIndex(cmd, state.clips);
    if (idx >= 0 && state.clips[idx]) {
      actions.push({ type: "remove_clip", clipId: state.clips[idx].id });
      rulesApplied.push(`Suppression du clip ${idx + 1}`);
      removed++;
    }
  }

  // ---- 3. Trim d'un clip (« coupe le clip 1 à 5s ») ----
  if (/(coupe|trim|raccourci|raccourcis)/.test(t) && !removed) {
    const idx = findClipIndex(cmd, state.clips);
    const sec = extractSeconds(cmd);
    if (idx >= 0 && state.clips[idx] && sec !== null) {
      const c = state.clips[idx];
      actions.push({ type: "trim", clipId: c.id, inPoint: c.inPoint, outPoint: Math.min(c.duration, c.inPoint + sec) });
      rulesApplied.push(`Coupe clip ${idx + 1} à ${sec.toFixed(1)}s`);
      clipsTrimmed++;
    }
  }

  // ---- 4. Ajout de texte (« ajoute le texte "Bonjour" sur le clip 1 ») ----
  if (/(ajoute|mets?|colle).*(texte|titre|legende)/.test(t)) {
    const m = cmd.match(/["«“]([^"»”]+)["»”]/);
    const text = m ? m[1] : "Mon titre";
    const idx = findClipIndex(cmd, state.clips);
    const targetIdx = idx >= 0 ? idx : 0;
    if (state.clips[targetIdx]) {
      actions.push({
        type: "add_text",
        clipId: state.clips[targetIdx].id,
        text,
        x: 0.5, y: 0.85, size: 64, color: "#ffffff",
      });
      rulesApplied.push(`Texte « ${text} » sur clip ${targetIdx + 1}`);
      textsAdded++;
    }
  }

  // ---- 5. Auto-montage : « monte tout seul », « fais le montage », « monte ma video » ----
  const isAutoEdit =
    /(monte|montage|fais ?le ?montage|edit)/.test(t) &&
    (/tout ?seul|automatique|auto|pour moi|ma video|la video/.test(t) || actions.length === 0);

  if (isAutoEdit && state.clips.length > 0) {
    const isReels = state.preset === "reels";
    // Durée max par clip selon le format
    const maxPerClip = isReels ? 4 : 12; // secondes

    state.clips.forEach((c, i) => {
      const currentLen = c.outPoint - c.inPoint;
      // Trim début/fin (5 % de marge) + cap durée max
      const margin = Math.min(0.3, c.duration * 0.05);
      const newIn = Math.max(c.inPoint, margin);
      const newOut = Math.min(c.outPoint, newIn + maxPerClip);
      if (Math.abs(newIn - c.inPoint) > 0.05 || Math.abs(newOut - c.outPoint) > 0.05) {
        actions.push({ type: "trim", clipId: c.id, inPoint: newIn, outPoint: newOut });
        clipsTrimmed++;
      }
      // Texte d'intro sur le 1er clip
      if (i === 0) {
        actions.push({
          type: "add_text",
          clipId: c.id,
          text: c.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 30),
          x: 0.5, y: isReels ? 0.2 : 0.15,
          size: isReels ? 90 : 72,
          color: "#ffffff",
        });
        textsAdded++;
      }
    });

    rulesApplied.push(
      `Auto-montage ${isReels ? "Reels" : "YouTube"} : trim auto + cap ${maxPerClip}s/clip + titre intro`,
    );
  }

  const totalAfter = totalBefore - clipsTrimmed * 0.5; // estimation grossière

  return {
    actions,
    rulesApplied,
    stats: {
      clipsCount: state.clips.length,
      clipsTrimmed,
      textsAdded,
      reordered,
      removed,
      formatChanged,
      preset: formatChanged
        ? (actions.find((a) => a.type === "set_format") as any)?.preset ?? state.preset
        : state.preset,
      totalDurationBefore: totalBefore,
      totalDurationAfter: Math.max(0, totalAfter),
    },
    unrecognized: actions.length === 0,
    command: cmd,
  };
}