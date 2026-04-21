import * as pdfjs from "pdfjs-dist";
// @ts-ignore - vite worker import
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "@/integrations/supabase/client";
import type { ChatAttachment } from "@/services";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_DOC_BYTES = 15 * 1024 * 1024; // 15 MB

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const s = r.result as string;
      resolve(s.split(",")[1] || "");
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const out: string[] = [];
  const maxPages = Math.min(doc.numPages, 50);
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => it.str).join(" ");
    out.push(`[Page ${i}]\n${text}`);
  }
  return out.join("\n\n");
}

export type AttachmentKind = "image" | "audio" | "document";

export function classifyFile(file: File): AttachmentKind | null {
  const m = file.type.toLowerCase();
  const n = file.name.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (
    m === "application/pdf" ||
    m.startsWith("text/") ||
    m === "application/json" ||
    m === "application/xml" ||
    n.endsWith(".pdf") || n.endsWith(".txt") || n.endsWith(".md") ||
    n.endsWith(".csv") || n.endsWith(".json") || n.endsWith(".log")
  ) return "document";
  return null;
}

export async function processFile(file: File): Promise<ChatAttachment> {
  const kind = classifyFile(file);
  if (!kind) throw new Error(`Type de fichier non supporté : ${file.name}`);

  if (kind === "image") {
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`Image trop lourde (${file.name}, max 8 Mo).`);
    const dataUrl = await fileToDataUrl(file);
    return { kind: "image", name: file.name, mime: file.type || "image/*", dataUrl };
  }

  if (kind === "audio") {
    if (file.size > MAX_AUDIO_BYTES) throw new Error(`Audio trop lourd (${file.name}, max 20 Mo).`);
    const base64 = await fileToBase64(file);
    const { data, error } = await supabase.functions.invoke("voice-transcribe", {
      body: { audio: base64 },
    });
    if (error) throw new Error(`Transcription échouée pour ${file.name}.`);
    const text = (data?.text as string) || "";
    return { kind: "audio", name: file.name, mime: file.type || "audio/*", text };
  }

  // document
  if (file.size > MAX_DOC_BYTES) throw new Error(`Document trop lourd (${file.name}, max 15 Mo).`);
  let text = "";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    text = await extractPdfText(file);
  } else {
    text = await file.text();
  }
  if (!text.trim()) throw new Error(`Aucun texte extrait de ${file.name}.`);
  return { kind: "document", name: file.name, mime: file.type || "text/plain", text };
}