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
}

export function organizeLocally(
  paths: string[],
  opts: OrganizeOptions = {},
): OrganizeResult {
  const { groupByYear = false, useSubcategories = true, rootName = "Dossier-Reorganise" } = opts;

  const mapping: Mapping[] = [];
  const categories: Record<string, number> = {};
  const rulesApplied = new Set<string>();
  const usedNames = new Set<string>();

  for (const from of paths) {
    const base = from.split("/").pop() || from;
    const ext = getExt(base);
    const cat = categoryFor(ext);
    rulesApplied.add(`Extension .${ext || "?"} → ${cat}`);

    const segments: string[] = [cat];

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
    categories[cat] = (categories[cat] || 0) + 1;
  }

  const topCats = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");

  const explanation =
    `Tri local effectué sur ${paths.length} fichiers. ` +
    `Catégories : ${topCats}.` +
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