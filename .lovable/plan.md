## Objectif

Transformer la page `/billing` actuelle (qui affiche juste 3 cartes d'abonnement + 2 packs en surface) en une vraie page de tarification complète, lisible, avec tous les détails dont tu as besoin pour comparer les offres.

## Constat actuel

`src/pages/Billing.tsx` affiche aujourd'hui :
- Le solde de crédits
- 3 abonnements (Starter / Pro / Ultra) → juste prix + nb de crédits
- 2 packs de crédits → juste prix + nb de crédits
- Aucune comparaison, aucun détail des avantages, aucune mention du plan Free, pas d'estimation de ce qu'on peut faire avec X crédits

## Ce que je propose d'ajouter

### 1. Plan **Free** (manquant aujourd'hui)
Ajouter une carte "Gratuit" :
- 0 crédit/mois (cohérent avec ta règle "pas de crédits à la création")
- Accès à l'app, historique de chats, agent local
- Pas d'IA tant qu'aucun crédit acheté/abonné

### 2. Détails enrichis pour chaque abonnement
Pour **Starter / Pro / Ultra**, ajouter sous chaque carte :
- Liste de features (✓ chat IA, ✓ génération image, ✓ agent local, ✓ vidéo, ✓ support, etc.)
- Estimation concrète : "≈ X questions simples / Y analyses / Z générations d'images" (basé sur ta grille 1 crédit = 500 tokens)
- Mention "crédits non utilisés perdus en fin de mois" (ou reportés, à toi de me dire)
- Badge "Économie de X%" sur Pro et Ultra vs Starter

### 3. Section **Packs** enrichie
- Garder les 2 packs actuels (1000 / 5000)
- Ajouter éventuellement un pack "10 000 crédits" pour les gros consommateurs (à valider)
- Mention "Crédits achetés ne expirent jamais" (vs crédits abonnement)
- Préciser la priorité de consommation : abonnement d'abord, puis achetés

### 4. Tableau comparatif
Sous les cartes, un **tableau récapitulatif** ligne par ligne :

| Feature | Free | Starter | Pro | Ultra |
|---|---|---|---|---|
| Crédits/mois | 0 | 2 000 | 8 000 | 25 000 |
| Prix | 0 € | 5 € | 15 € | 40 € |
| Coût / 1 000 crédits | — | 2,50 € | 1,88 € | 1,60 € |
| Chat IA | ✓ | ✓ | ✓ | ✓ |
| Génération image | ✗ | ✓ | ✓ | ✓ |
| Agent local | ✓ | ✓ | ✓ | ✓ |
| Édition vidéo | ✗ | ✓ | ✓ | ✓ |
| Support | Communauté | Email | Email prio | Prio + |

(Les features par tier sont à valider — je propose une base, tu ajustes.)

### 5. FAQ courte en bas de page
3-4 questions classiques :
- "Comment sont consommés les crédits ?" → renvoi à ta grille tokens
- "Que se passe-t-il si je n'ai plus de crédits ?" → blocage + invitation à recharger
- "Puis-je changer d'abonnement ?" → oui à tout moment (à confirmer)
- "Les crédits achetés expirent-ils ?" → non (vs ceux d'abonnement)

### 6. État "Plan actuel"
Mettre en évidence visuellement le plan dans lequel se trouve l'utilisateur (badge "Votre plan actuel" sur la carte correspondante, basé sur `user_credits.subscription_tier`).

### 7. Aucun changement DB / backend
Toute la logique est déjà en place (table `user_credits` avec `subscription_tier`, `consume_credits`, `add_credits`). Pas de migration. Juste de la refonte UI dans `src/pages/Billing.tsx`.

Les boutons "Choisir" / "Acheter" continueront d'afficher le toast "Paiement bientôt disponible" tant que tu n'as pas créé tes comptes Paddle/Stripe.

## Fichiers impactés

- `src/pages/Billing.tsx` → refonte complète (un seul fichier)

## À me confirmer avant de coder

1. **Features par tier** : OK avec ma proposition (génération image bloquée en Free, vidéo bloquée en Free) ou tu veux une autre répartition ?
2. **Crédits abonnement non utilisés** : reset à zéro chaque mois, ou report sur le mois suivant ?
3. **4ème pack à 10 000 crédits** : je l'ajoute ou on reste à 2 packs ?

Une fois validé, je refonds `src/pages/Billing.tsx` en une seule passe.