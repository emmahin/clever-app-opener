import { NewsItem } from "./types";

export interface INewsService {
  getLatest(): Promise<NewsItem[]>;
}

const MOCK: NewsItem[] = [
  { id: "1", title: "OpenAI dévoile GPT-5.2 avec un raisonnement étendu", source: "OpenAI Blog", url: "#", publishedAt: "il y a 2h", summary: "Le nouveau modèle améliore les performances sur les tâches multi-étapes." },
  { id: "2", title: "Google publie Gemini 3 Pro Preview", source: "Google DeepMind", url: "#", publishedAt: "il y a 5h", summary: "Une nouvelle génération multimodale axée sur le raisonnement." },
  { id: "3", title: "Anthropic lance Claude Opus 4.5", source: "Anthropic", url: "#", publishedAt: "hier", summary: "Améliorations notables pour le codage et l'utilisation d'outils." },
  { id: "4", title: "L'EU AI Act entre dans sa phase d'application", source: "Reuters", url: "#", publishedAt: "hier", summary: "Les premiers contrôles ciblent les modèles à usage général." },
  { id: "5", title: "Mistral lève 1Md€ pour son IA souveraine", source: "Les Echos", url: "#", publishedAt: "il y a 2j", summary: "Une nouvelle ronde valorise l'entreprise française à 12Md€." },
];

export const mockNewsService: INewsService = {
  async getLatest() {
    await new Promise((r) => setTimeout(r, 200));
    return MOCK;
  },
};
