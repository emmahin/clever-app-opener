

## Correction : les notifications ne s'affichent pas

### Diagnostic
Il est ~23h40 chez toi. Dans `notificationService.ts`, les **heures silencieuses par défaut sont 22h → 8h**, et la fonction `isInQuietHours()` bloque alors **tous les toasts** (y compris la livraison des rappels programmés). La notif est bien créée et stockée — mais le toast est supprimé silencieusement. Tu peux le vérifier : ouvre `/notifications`, ton rappel "dans 1 minute" est probablement listé comme livré mais non lu, sans qu'aucun toast ne soit apparu.

Bug secondaire : la logique `isInQuietHours` est confuse — le mode DND et les quiet hours sont mal séparés.

### Corrections

**1. `src/services/notificationService.ts`**
- **Désactiver les quiet hours par défaut** : passer `quietStartHour` et `quietEndHour` à `0` dans `DEFAULT_PREFS` + ajouter un flag `quietHoursEnabled: false`. Comme ça plus aucun blocage horaire tant que l'utilisateur ne les active pas explicitement.
- **Réécrire `isInQuietHours`** proprement :
  ```
  if (prefs.doNotDisturb) return true;
  if (!prefs.quietHoursEnabled) return false;
  // sinon vérifier la fenêtre horaire
  ```
- **Forcer la migration** des prefs déjà en localStorage : si l'utilisateur a l'ancienne config (22→8 sans flag), on ajoute `quietHoursEnabled: false` au load → ses notifs marchent immédiatement sans qu'il touche aux réglages.
- **Toujours livrer** une notif programmée quand son heure arrive (mettre `delivered: true` et la stocker), mais **ne pas afficher le toast** si quiet hours actives. Le badge de la cloche s'incrémentera quand même → l'utilisateur verra qu'il a quelque chose en attente.
- **Augmenter la fréquence du scheduler** : passer de 30 s à **5 s** pour les rappels courts ("dans 1 minute"), sinon il y a jusqu'à 30 s de retard.

**2. `src/pages/Settings.tsx`**
- Ajouter un toggle "Activer les heures silencieuses" lié à `quietHoursEnabled`, désactivé par défaut. Les champs heure début/fin restent visibles mais grisés tant que le toggle est off.
- Petit texte d'aide : « Quand actives, aucune notification toast n'apparaît dans cette plage. Les notifications restent visibles dans la cloche. »

**3. Test rapide après fix**
Tu pourras dire à Nex *"rappelle-moi de dire bonjour dans 30 secondes"* et voir un toast apparaître ~30 s plus tard, peu importe l'heure de la journée.

### Fichiers modifiés
- `src/services/notificationService.ts` (defaults + logique quiet hours + migration + scheduler 5s)
- `src/pages/Settings.tsx` (toggle quiet hours)

