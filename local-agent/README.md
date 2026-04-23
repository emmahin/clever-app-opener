# Nex Local Agent

Petit serveur HTTP qui tourne **sur ton PC** et permet à Nex (l'app web) d'ouvrir
n'importe quelle application installée localement.

```
┌─────────────────┐   HTTPS   ┌──────────┐   localhost   ┌──────────────┐
│ App web Nex     │──────────▶│ Navigateur│──────────────▶│ Agent Python │──▶ Ton app
│ (Lovable)       │           │ Chrome    │              │ 127.0.0.1     │
└─────────────────┘           └──────────┘              │   :17345      │
                                                       └──────────────┘
```

## 1. Installer

```bash
cd local-agent
pip install -r requirements.txt
```

## 2. Choisir un token

Tu génères un token long et aléatoire (≥ 32 caractères). Exemple :

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## 3. Lancer l'agent

**Windows (PowerShell)** :
```powershell
$env:NEX_AGENT_TOKEN="colle_ici_ton_token"
python agent.py
```

**Linux / macOS** :
```bash
export NEX_AGENT_TOKEN="colle_ici_ton_token"
python agent.py
```

L'agent écoute sur `http://127.0.0.1:17345`.

## 4. Brancher dans Nex

Va dans **Paramètres → Agent local PC**, colle :
- **URL de l'agent** : `http://127.0.0.1:17345`
- **Token** : le même qu'à l'étape 2

Clique sur **Tester la connexion**. Si tout est vert, tu peux dire à l'IA :

> « Ouvre Notepad »
> « Lance Spotify »
> « Ouvre `C:\Users\moi\Documents\projet\` »

## 5. (Optionnel) Restreindre la liste d'applications

Pour ne laisser ouvrir QUE certaines apps :

```bash
export NEX_AGENT_ALLOWLIST="notepad,spotify,code,chrome"
```

Si vide, tout est autorisé (mais l'auth Bearer protège déjà).

## Sécurité

- L'agent n'écoute QUE sur `127.0.0.1` (pas accessible depuis le réseau).
- Toutes les requêtes exigent le header `Authorization: Bearer <token>`.
- CORS limité par défaut aux domaines `*.lovable.app`, `*.lovableproject.com`
  et `localhost`.
- Optionnel : allowlist d'apps via `NEX_AGENT_ALLOWLIST`.

**Ne partage jamais ton token.** Quiconque l'a peut lancer des programmes sur ton PC.

## Lancer au démarrage de Windows

Crée un raccourci dans `shell:startup` qui exécute :

```
pythonw.exe C:\chemin\vers\local-agent\agent.py
```

(et définis `NEX_AGENT_TOKEN` dans tes variables d'environnement utilisateur).

## API

| Endpoint   | Méthode | Description                                   |
| ---------- | ------- | --------------------------------------------- |
| `/ping`    | GET     | Vérifie que l'agent tourne et le token bon    |
| `/launch`  | POST    | `{ "target": "notepad", "args": [] }` lance   |