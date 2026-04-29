## Objectif

Transformer la racine `/` en **expérience vocale immersive** (style Jarvis), et déplacer **toute l'app actuelle** (chat texte, sidebar, projets, header) sur une nouvelle route `/menu` accessible aussi bien à la souris qu'à la voix ("ouvre le menu", "retour au chat", etc.).

Aucune fonctionnalité existante n'est supprimée. Aucune edge function n'est touchée. STT/TTS = pile actuelle (`voice-transcribe` + `voice-chat` + `elevenlabs-tts`).

## Architecture des routes après changement

```
/              → NOUVELLE page Voice (orbe immersif plein écran)
/menu          → l'ancienne page Index (chat texte + sidebar + projets)
/dashboard     → inchangé
/agenda        → inchangé
/settings      → inchangé
/documents, /video, /billing, /notifications, /admin/*, /auth → inchangés
```

Aucune URL existante ne casse, sauf `/` qui change de rôle. Tous les composants qui faisaient `navigate("/")` pour revenir au chat seront mis à jour vers `/menu`.

## La nouvelle page `/` (Voice)

Fichier : `src/pages/Voice.tsx` + composants dédiés dans `src/components/voice/`.

### Visuel
- Plein écran, fond noir/bleu nuit avec dégradé radial spatial.
- **Orbe central** unique, ~40% de la largeur viewport :
  - Sphère SVG avec gradient cyan→violet, halo glow externe.
  - **3 anneaux** SVG en rotation lente (déjà éprouvé via `ChatOrb`, on le réécrit en plus immersif).
  - **Ondes / particules** générées en `<canvas>` à partir de l'AnalyserNode du micro (FFT 256 bins → barres radiales).
- États avec couleur dominante :
  - **idle** (respiration) → bleu doux, scale 1.0 ↔ 1.04, 4s.
  - **listening** (utilisateur parle) → cyan vif, scale réagit au volume RMS du micro.
  - **thinking** (IA réfléchit) → violet pulsant + anneaux qui accélèrent.
  - **speaking** (IA répond) → cyan animé + ondes pilotées par l'AnalyserNode de l'audio TTS.
- Transitions de couleur et d'échelle fluides via CSS transitions + `requestAnimationFrame` pour le canvas (60fps).

### Bas d'écran
- Gros bouton micro circulaire (toggle mute / push-to-talk).
- Pastille d'état texte discrète : "À l'écoute…", "Je réfléchis…", "Je réponds…".
- Bouton "Menu" en haut à droite → navigue vers `/menu`.
- Transcription live en bas (optionnelle, toggleable, petite typo).
- Bouton mute en bas à gauche.

### Comportement
- Au mount : démarre le mode vocal continu via `TwinVoiceProvider` (déjà existant).
- Détection vocale d'intents (réutilise la fonction `detectVoiceIntent` déjà présente dans `VoiceCallMode.tsx`) : si l'utilisateur dit "ouvre le menu", "ouvre l'agenda", "va aux paramètres"… → `navigate(path)` automatique.
- Ajout de l'intent `"menu"` qui mappe vers `/menu` ("ouvre le menu", "retour au chat", "le chat").
- Timeout silence : après 30 s sans parole, retour à l'état idle (respiration).

### Technique
- Web Audio API : `AudioContext` + `MediaStreamSource` + `AnalyserNode` (fftSize 256) sur le `MediaStream` exposé par `webVoiceService.getStream()`.
- Animation canvas en `requestAnimationFrame`, cleanup propre dans `useEffect`.
- Pour l'audio TTS, on branche aussi un `AnalyserNode` sur l'`HTMLAudioElement` retourné par `speakWithElevenLabs` (via `MediaElementAudioSource`).
- Pas de nouvelle dépendance (pas de Framer Motion, pas de GSAP) — tout en CSS + canvas natif pour rester léger.

## Réorganisation

1. **`src/pages/Index.tsx` → `src/pages/Menu.tsx`** : renommé tel quel, zéro changement fonctionnel (le chat texte reste 100% identique).
2. **`src/pages/Voice.tsx`** : nouvelle page (~250 lignes).
3. **`src/components/voice/VoiceOrb.tsx`** : composant orbe immersif (SVG + canvas).
4. **`src/components/voice/VoiceHud.tsx`** : boutons micro/mute/menu + état texte + transcription.
5. **`src/App.tsx`** : route `/` → `<Voice />`, route `/menu` → `<Menu />`.
6. **Recherche/remplacement** des `navigate("/")` qui voulaient dire "retourne au chat" → `navigate("/menu")`. Concerne notamment `Sidebar.tsx`, `VoiceCallMode.tsx`, `Header.tsx` (si présent). On ne touche PAS aux liens "logo accueil" : eux gardent `/` (= orbe).
7. **`Sidebar.tsx`** : ajouter un item "Assistant vocal" pointant vers `/` en haut de menu.

## Détails techniques (section dev)

```text
src/pages/Voice.tsx
├── useTwinVoiceContext()        // déjà branché sur voice-chat + ElevenLabs
├── useVoiceAnalyser(stream)     // hook custom : RMS + FFT bins, 60fps
└── render
    ├── <VoiceOrb state={...} amplitude={rms} fft={bins} />
    └── <VoiceHud onMute onMenu transcript state />

src/components/voice/VoiceOrb.tsx
├── <svg> sphère + 3 anneaux animés (CSS transform)
└── <canvas> particules / waveform radial (rAF)

src/hooks/useVoiceAnalyser.ts
└── crée AudioContext + AnalyserNode, expose { rms, frequencyData }
```

État dérivé pour la couleur :
- `idle`     → `--orb: hsl(220 90% 60%)`
- `listening`→ `--orb: hsl(195 95% 60%)`
- `thinking` → `--orb: hsl(280 90% 65%)`
- `speaking` → `--orb: hsl(180 95% 60%)`

Couleurs ajoutées comme tokens dans `index.css` (HSL, semantic).

## Hors scope
- Pas de nouveau provider vocal (Conversational Agent, Realtime, etc.).
- Pas de modification des edge functions.
- Pas de suppression de pages, services, ou intégrations existantes.
- Pas de migration DB.
