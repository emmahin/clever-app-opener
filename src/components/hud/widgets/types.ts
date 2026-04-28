import type { ComponentType } from "react";

export type WidgetKind =
  | "welcome"
  | "voiceQuota"
  | "news"
  | "stocks"
  | "clock"
  | "shortcuts"
  | "systemStatus";

export interface WidgetMeta {
  kind: WidgetKind;
  title: string;
  description: string;
  /** Tailles par défaut sur 12 colonnes : w (col), h (row de 60px) */
  defaultW: number;
  defaultH: number;
  minW?: number;
  minH?: number;
  Component: ComponentType;
}