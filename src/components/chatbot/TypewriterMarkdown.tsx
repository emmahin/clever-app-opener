import { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";

interface TypewriterMarkdownProps {
  text: string;
  /** Caractères affichés par tick */
  speed?: number;
  /** Intervalle entre les ticks (ms) */
  intervalMs?: number;
}

/**
 * Affiche progressivement le texte (effet machine à écrire) tout en restant
 * synchrone avec un flux qui s'accumule (streaming). Si le texte arrive plus
 * vite que l'animation, on accélère pour rattraper sans jamais dépasser.
 *
 * IMPORTANT : si le composant est monté avec un texte déjà complet (= message
 * historique rechargé depuis la DB, pas de streaming en cours), on affiche
 * tout immédiatement pour éviter toute troncature visuelle.
 */
export function TypewriterMarkdown({ text, speed = 2, intervalMs = 18 }: TypewriterMarkdownProps) {
  // Si on est monté avec un texte déjà long (>40 chars), on considère que c'est
  // un message complet rechargé : on affiche tout sans animation.
  const initialLenRef = useRef(text.length);
  const [shown, setShown] = useState(() => (text.length > 40 ? text.length : 0));
  const targetRef = useRef(text.length);
  targetRef.current = text.length;

  useEffect(() => {
    // Pas d'intervalle si déjà tout affiché
    const id = setInterval(() => {
      setShown((prev) => {
        if (prev >= targetRef.current) return prev;
        const remaining = targetRef.current - prev;
        const step = Math.max(speed, Math.floor(remaining / 30));
        return Math.min(targetRef.current, prev + step);
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [speed, intervalMs]);

  // Si le texte se réduit (nouveau message réutilisant l'instance), reset.
  // Si le texte rallonge, on garde `shown` pour continuer le streaming.
  useEffect(() => {
    if (text.length < shown) setShown(text.length);
  }, [text, shown]);

  // Filet de sécurité : si après 8s on n'a pas rattrapé, on force l'affichage complet
  // (évite tout cas où l'animation se bloquerait avec un message tronqué visuellement).
  useEffect(() => {
    const t = setTimeout(() => {
      setShown((prev) => (prev < targetRef.current ? targetRef.current : prev));
    }, 8000);
    return () => clearTimeout(t);
  }, [text]);

  const visible = text.slice(0, shown);
  const isTyping = shown < text.length;
  // Suppress unused var warning
  void initialLenRef;

  return (
    <div className="prose prose-sm prose-invert max-w-none">
      <ReactMarkdown>{visible}</ReactMarkdown>
      {isTyping && (
        <span className="inline-block w-1.5 h-4 bg-primary/80 ml-0.5 align-middle animate-pulse" />
      )}
    </div>
  );
}