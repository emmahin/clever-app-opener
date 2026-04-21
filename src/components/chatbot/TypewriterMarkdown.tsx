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
 */
export function TypewriterMarkdown({ text, speed = 2, intervalMs = 18 }: TypewriterMarkdownProps) {
  const [shown, setShown] = useState(0);
  const targetRef = useRef(text.length);
  targetRef.current = text.length;

  useEffect(() => {
    const id = setInterval(() => {
      setShown((prev) => {
        if (prev >= targetRef.current) return prev;
        const remaining = targetRef.current - prev;
        // Accélère si retard important
        const step = Math.max(speed, Math.floor(remaining / 30));
        return Math.min(targetRef.current, prev + step);
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [speed, intervalMs]);

  // Si le texte se réduit (nouveau message), reset
  useEffect(() => {
    if (text.length < shown) setShown(text.length);
  }, [text, shown]);

  const visible = text.slice(0, shown);
  const isTyping = shown < text.length;

  return (
    <div className="prose prose-sm prose-invert max-w-none">
      <ReactMarkdown>{visible}</ReactMarkdown>
      {isTyping && (
        <span className="inline-block w-1.5 h-4 bg-primary/80 ml-0.5 align-middle animate-pulse" />
      )}
    </div>
  );
}