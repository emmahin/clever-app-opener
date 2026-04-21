

## Ajouter un outil "Envoyer un message WhatsApp" à l'IA

### Objectif
Permettre à l'IA du chat principal d'envoyer un message à un contact WhatsApp depuis la conversation. Exemple : *"Envoie 'Salut, on se voit demain ?' à Léa"* → l'IA crée le message dans `/whatsapp`.

### Comportement
1. L'utilisateur écrit une demande naturelle dans le chat IA.
2. L'IA détecte l'intention et appelle un nouvel outil `send_whatsapp_message({ contact_name, body })`.
3. Comme la liste des contacts vit dans `localStorage` (pas accessible côté serveur), la résolution du contact + l'écriture du message se font **côté client** :
   - Le serveur (edge function `ai-orchestrator`) renvoie un widget spécial `whatsapp_send` avec `{ contact_name, body }`.
   - Un nouveau composant client `WhatsAppSendWidget` s'occupe de :
     - chercher le contact par nom (match insensible à la casse, partiel),
     - si trouvé : afficher une carte de prévisualisation avec bouton **Envoyer** (et **Modifier**),
     - si plusieurs candidats : afficher la liste à choisir,
     - si aucun : proposer **Créer le contact** (mini-formulaire nom + téléphone),
     - au clic Envoyer : pousser le message dans `wa_messages` (localStorage) + toast de confirmation + lien "Ouvrir la conversation" qui navigue vers `/whatsapp` avec le contact pré-sélectionné.

### Changements techniques

**1. `supabase/functions/ai-orchestrator/index.ts`**
- Ajouter la définition d'outil `send_whatsapp_message` dans la liste des `tools` envoyée à l'IA :
  ```
  { name: "send_whatsapp_message",
    parameters: { contact_name: string, body: string } }
  ```
- Dans `callTool`, gérer ce nom : ne fait aucun appel externe, retourne juste `{ widget: { kind: "whatsapp_send", contact_name, body }, summary: "Message prêt à envoyer à <name>." }`.
- Mise à jour mineure du `SYSTEM_PROMPT` : mentionner que l'outil existe pour envoyer des messages WhatsApp.

**2. `src/components/chatbot/MessageWidgets.tsx`**
- Ajouter un nouveau case `whatsapp_send` qui rend `<WhatsAppSendWidget contactName={...} body={...} />`.

**3. Nouveau fichier `src/components/chatbot/WhatsAppSendWidget.tsx`**
- Lit `wa_contacts` / `wa_messages` depuis `localStorage`.
- Logique de matching de contact + UI carte (style violet/noir cohérent).
- Bouton **Envoyer** : ajoute le message dans `wa_messages` avec `fromMe: true, status: "sent"`, puis `setTimeout` → `delivered` (mêmes règles que la page WhatsApp).
- Bouton **Ouvrir conversation** : `navigate(`/whatsapp?contact=${id}`)`.

**4. `src/pages/WhatsApp.tsx`**
- Lire le param URL `?contact=<id>` au chargement et faire `setActiveId` automatiquement.

**5. `src/components/chatbot/SuggestionPills.tsx`** (option mineure)
- Ajouter une suggestion type *"Envoie un message à Léa sur WhatsApp"* pour rendre la fonctionnalité découvrable.

### Diagramme de flux
```text
User → ChatIA → ai-orchestrator
                 │
                 ├─ tool_call: send_whatsapp_message
                 │   { contact_name: "Léa", body: "Salut !" }
                 │
                 └─ widget: whatsapp_send  ─────► WhatsAppSendWidget (client)
                                                   │
                                                   ├─ trouve contact dans localStorage
                                                   ├─ aperçu + bouton Envoyer
                                                   └─ écrit dans wa_messages
                                                       puis lien → /whatsapp?contact=id
```

### Notes
- Aucune intégration WhatsApp réelle ici : on alimente l'interface locale (Selenium/automation viendra en local plus tard, comme prévu).
- Aucun ajout de table backend nécessaire (les données restent dans `localStorage`).
- Confirmation utilisateur obligatoire avant envoi (pas d'envoi silencieux par l'IA).

