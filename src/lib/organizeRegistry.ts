// Registry pour conserver les fichiers bruts associés à un message de tri.
// Permet au widget OrganizeFilesWidget de générer un ZIP sans repasser par l'IA.
// 100 % local, aucun token consommé.

const store = new Map<string, File[]>();

export function registerOrganizeFiles(messageId: string, files: File[]) {
  store.set(messageId, files);
}

export function getOrganizeFiles(messageId: string): File[] | undefined {
  return store.get(messageId);
}

export function clearOrganizeFiles(messageId: string) {
  store.delete(messageId);
}