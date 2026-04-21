

## Plan : réduire au maximum la consommation de tokens

Objectif : diviser par **3 à 5** la consommation actuelle, sans perdre de fonctionnalité visible.

### Estimation actuelle (par message)
- System prompt : **~3 000 tokens** envoyés à CHAQUE appel
- Historique : croît sans limite (~500 tokens / échange)
- Documents joints : tronqués à **60 000 caractères** (~15 000 tokens)
- Modèle par défaut : `gemini-2.5-flash` (OK), mais `gemini-2.5-pro` activé dès que "deep think" est coché (10× plus cher)

### Optimisations à appliquer

**1. System prompt modulaire (gain ~60 % du prompt)**
- Bloc "désambiguïsation visuelle" (Air Force, Yeezy, Mustang…) : déplacé UNIQUEMENT dans la `description` de l'outil `search_images`. Économie : **~400 tokens / appel**.
- Bloc "EMPLOI DU TEMPS" : envoyé seulement si la question ressemble à du planning (regex simple côté serveur sur `latestUserText`). Économie : **proportionnelle au nombre d'événements**.
- 12 règles numérotées → compactées en 6 lignes courtes. Économie : **~300 tokens**.
- Désactiver les outils non sollicités via détection contextuelle : ne déclarer `fetch_news`/`fetch_stocks`/`send_whatsapp_message`/`create_reminder`/schedule QUE si le message courant ou les 2 derniers les évoquent (mots-clés). Économie : **~600-800 tokens / appel** (les schémas d'outils sont la plus grosse partie du prompt).

**2. Sliding window sur l'historique (gain linéaire)**
- Côté `Index.tsx` : ne transmettre que les **8 derniers messages** + un résumé compressé du reste (1-2 phrases) si > 8.
- Économie : sur une conversation de 20 tours, on passe de ~10 000 → ~2 500 tokens d'historique.

**3. Réduire les pièces jointes**
- `attachments` documents : troncature **60 000 → 12 000 caractères** (`ai-orchestrator/index.ts` ligne ~734). Suffisant pour la plupart des PDF/textes, économie **~12 000 tokens** sur un gros doc.
- Audio transcrit : ajouter une troncature à 8 000 caractères (actuellement illimitée).

**4. Modèle par défaut plus léger**
- Remplacer `google/gemini-2.5-flash` par `google/gemini-3-flash-preview` (le défaut Lovable, moins cher et plus rapide).
- Renommer le toggle "Deep think" pour qu'il soit clair qu'il coûte 10× plus, et le passer de `gemini-2.5-pro` → `gemini-3.1-pro-preview` (équivalent perf, moins cher).

**5. Web search & news : limiter le retour**
- `web_search` : passer de 8 résultats à **5**, snippets tronqués à **180 caractères**. Économie : **~400 tokens** par appel d'outil.
- `fetch_news` : passer de 12 → **8** items, retirer les `summary` de la sortie résumée envoyée au modèle (déjà visibles dans le widget).

**6. (Optionnel) Cache du system prompt**
- Le SDK Lovable AI ne supporte pas encore explicitement le prompt caching côté client, mais en figeant le prompt système (mêmes octets entre 2 appels d'un même utilisateur) on maximise les chances de cache transparent côté gateway.

### Détails techniques

```text
ai-orchestrator/index.ts
├─ buildSystemPrompt()
│   ├─ supprimer bloc "DÉSAMBIGUÏSATION DU CONTEXTE" (113 lignes → 0)
│   ├─ schedBlock : ne render que si needsScheduleContext(userText)
│   └─ règles 1-12 → 6 lignes
├─ TOOLS array
│   └─ filterToolsForMessage(userText, history) : renvoyer un sous-ensemble
├─ ligne 734 : .slice(0, 60000) → .slice(0, 12000)
├─ ligne 736 : ajouter .slice(0, 8000) sur audio.text
├─ ligne 811 : "gemini-2.5-flash" → "gemini-3-flash-preview"
└─ web_search/fetch_news : réduire items + tronquer snippets

src/pages/Index.tsx
└─ historyForAI : ne garder que les 8 derniers, optionnellement préfixer
   par { role: "system", content: "Résumé conversation antérieure: …" }
```

### Gain estimé
| Poste | Avant | Après | Économie |
|---|---|---|---|
| System prompt | ~3 000 | ~1 200 | -1 800 |
| Historique (10 tours) | ~5 000 | ~1 500 | -3 500 |
| Doc joint typique | ~15 000 | ~3 000 | -12 000 |
| **Total / message moyen** | **~5-8 k** | **~1.5-2.5 k** | **~65 %** |

### Fichiers modifiés
- `supabase/functions/ai-orchestrator/index.ts` (refonte prompt + filtre outils + troncatures + modèle)
- `src/pages/Index.tsx` (sliding window historique)

Aucune fonctionnalité visible n'est retirée. Tu peux toujours forcer l'IA à utiliser n'importe quel outil avec une demande explicite — le filtrage est basé sur des mots-clés permissifs.

