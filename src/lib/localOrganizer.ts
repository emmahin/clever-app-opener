// Moteur de tri local — 100% gratuit, aucun appel API, aucun token consommé.
// Classe les fichiers par type (extension), avec sous-catégories thématiques
// déduites du nom de fichier (factures, contrats, photos, etc.).

export type Mapping = { from: string; to: string };

export interface OrganizeResult {
  rootName: string;
  mapping: Mapping[];
  explanation: string;
  stats: {
    total: number;
    categories: Record<string, number>;
    rulesApplied: string[];
  };
}

const CATEGORIES: { name: string; exts: string[] }[] = [
  { name: "Images", exts: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "heic", "tiff", "raw"] },
  { name: "Vidéos", exts: ["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v"] },
  { name: "Audio", exts: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma"] },
  { name: "Documents", exts: ["pdf", "doc", "docx", "odt", "rtf", "txt", "md", "tex"] },
  { name: "Tableurs", exts: ["xls", "xlsx", "ods", "csv", "tsv"] },
  { name: "Présentations", exts: ["ppt", "pptx", "odp", "key"] },
  { name: "Archives", exts: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"] },
  { name: "Code", exts: ["js", "ts", "tsx", "jsx", "py", "java", "c", "cpp", "h", "cs", "go", "rs", "rb", "php", "html", "css", "json", "xml", "yml", "yaml", "sh"] },
  { name: "Polices", exts: ["ttf", "otf", "woff", "woff2"] },
  { name: "3D-CAO", exts: ["obj", "fbx", "stl", "blend", "dwg", "dxf"] },
  { name: "Executables", exts: ["exe", "msi", "dmg", "apk", "app", "deb", "rpm"] },
];

const KEYWORDS: { sub: string; words: string[] }[] = [
  { sub: "Factures", words: ["facture", "invoice", "fact_", "fact-"] },
  { sub: "Contrats", words: ["contrat", "contract", "accord", "agreement"] },
  { sub: "Devis", words: ["devis", "quote", "estimate"] },
  { sub: "Reçus", words: ["recu", "reçu", "receipt", "ticket"] },
  { sub: "Relevés", words: ["releve", "relevé", "statement", "bank"] },
  { sub: "CV", words: ["cv", "resume", "curriculum"] },
  { sub: "Captures", words: ["screenshot", "capture", "screen-", "screen_"] },
  { sub: "Photos", words: ["img_", "img-", "dsc_", "dsc-", "photo", "pict"] },
  { sub: "Rapports", words: ["rapport", "report"] },
  { sub: "Notes", words: ["note", "memo"] },
];

function getExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function categoryFor(ext: string): string {
  for (const c of CATEGORIES) if (c.exts.includes(ext)) return c.name;
  return "Autres";
}

function subcategoryFor(name: string): string | null {
  const lower = name.toLowerCase();
  for (const k of KEYWORDS) {
    if (k.words.some((w) => lower.includes(w))) return k.sub;
  }
  return null;
}

function yearFromName(name: string): string | null {
  const m = name.match(/(19|20)\d{2}/);
  return m ? m[0] : null;
}

export interface OrganizeOptions {
  groupByYear?: boolean;
  useSubcategories?: boolean;
  rootName?: string;
  /** Règles personnalisées de l'utilisateur, prioritaires sur les règles par défaut. */
  customRules?: CustomRule[];
}

/** Règle utilisateur : si le nom de fichier contient un mot-clé OU correspond à une extension,
 *  alors le fichier est placé dans le dossier `target`. */
export interface CustomRule {
  keywords: string[]; // mots-clés à chercher dans le nom (insensible à la casse)
  extensions: string[]; // extensions ciblées (sans le point), vide = toutes
  target: string; // chemin de dossier cible, ex: "Comptabilité/2024"
  label?: string; // étiquette lisible pour le journal
}

/** Parse un texte libre en règles structurées.
 *  Format simple, une règle par ligne :
 *    - "facture, invoice -> Comptabilité/Factures"
 *    - ".pdf -> Documents/PDFs"
 *    - "photo, img -> Médias/Photos"
 *    - "facture + .pdf -> Comptabilité/Factures-PDF"
 */
export function parseCustomRules(text: string): CustomRule[] {
  if (!text || !text.trim()) return [];
  const rules: CustomRule[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  for (const line of lines) {
    // Accepte ->, →, =>, :
    const m = line.match(/^(.+?)\s*(?:->|→|=>|:)\s*(.+)$/);
    if (!m) continue;
    const left = m[1].trim();
    const target = m[2].trim().replace(/^\/+|\/+$/g, "");
    if (!target) continue;

    const tokens = left.split(/[,+]/).map((t) => t.trim()).filter(Boolean);
    const keywords: string[] = [];
    const extensions: string[] = [];
    for (const tok of tokens) {
      if (tok.startsWith(".")) extensions.push(tok.slice(1).toLowerCase());
      else keywords.push(tok.toLowerCase());
    }
    rules.push({ keywords, extensions, target, label: line });
  }
  return rules;
}

function matchesRule(name: string, ext: string, rule: CustomRule): boolean {
  const lower = name.toLowerCase();
  const kwOk = rule.keywords.length === 0 || rule.keywords.some((k) => lower.includes(k));
  const extOk = rule.extensions.length === 0 || rule.extensions.includes(ext);
  // Si l'utilisateur a fourni les deux, il faut que les deux matchent.
  if (rule.keywords.length && rule.extensions.length) return kwOk && extOk;
  // Sinon, au moins un critère doit matcher (et celui défini doit matcher).
  if (rule.keywords.length) return kwOk;
  if (rule.extensions.length) return extOk;
  return false;
}

export function organizeLocally(
  paths: string[],
  opts: OrganizeOptions = {},
): OrganizeResult {
  const {
    groupByYear = false,
    useSubcategories = true,
    rootName = "Dossier-Reorganise",
    customRules = [],
  } = opts;

  const mapping: Mapping[] = [];
  const categories: Record<string, number> = {};
  const rulesApplied = new Set<string>();
  const usedNames = new Set<string>();

  for (const from of paths) {
    const base = from.split("/").pop() || from;
    const ext = getExt(base);

    // 1) Règles utilisateur prioritaires
    let segments: string[] | null = null;
    let categoryLabel = "";
    for (const rule of customRules) {
      if (matchesRule(base, ext, rule)) {
        segments = rule.target.split("/").filter(Boolean);
        categoryLabel = segments[0] || rule.target;
        rulesApplied.add(`Règle personnalisée : "${rule.label || rule.target}"`);
        break;
      }
    }

    // 2) Règles par défaut si aucune règle utilisateur n'a matché
    if (!segments) {
      const cat = categoryFor(ext);
      categoryLabel = cat;
      rulesApplied.add(`Extension .${ext || "?"} → ${cat}`);
      segments = [cat];

      if (useSubcategories) {
        const sub = subcategoryFor(base);
        if (sub) {
          segments.push(sub);
          rulesApplied.add(`Mot-clé détecté → ${sub}`);
        }
      }

      if (groupByYear) {
        const y = yearFromName(base);
        if (y) {
          segments.push(y);
          rulesApplied.add(`Année ${y} détectée dans le nom`);
        }
      }
    }

    let to = segments.join("/") + "/" + base;
    // Évite les collisions
    let i = 1;
    while (usedNames.has(to)) {
      const dot = base.lastIndexOf(".");
      const stem = dot > 0 ? base.slice(0, dot) : base;
      const tail = dot > 0 ? base.slice(dot) : "";
      to = segments.join("/") + "/" + `${stem} (${i})${tail}`;
      i++;
    }
    usedNames.add(to);

    mapping.push({ from, to });
    categories[categoryLabel] = (categories[categoryLabel] || 0) + 1;
  }

  const topCats = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");

  const explanation =
    `Tri local effectué sur ${paths.length} fichiers. ` +
    `Catégories : ${topCats}.` +
    (customRules.length ? ` ${customRules.length} règle(s) personnalisée(s) appliquée(s).` : "") +
    (groupByYear ? " Regroupement par année activé." : "") +
    (useSubcategories ? " Sous-dossiers thématiques activés (factures, contrats, photos…)." : "");

  return {
    rootName,
    mapping,
    explanation,
    stats: {
      total: paths.length,
      categories,
      rulesApplied: Array.from(rulesApplied),
    },
  };
}