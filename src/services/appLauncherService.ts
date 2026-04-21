import { AppDescriptor, AppLaunchResult } from "./types";

/**
 * Interface destinée à être implémentée côté desktop (VSCode + utilitaire Windows).
 * L'impl web ne peut PAS lancer d'apps locales depuis un navigateur ; elle
 * sert de placeholder et renvoie un message explicite.
 */
export interface IAppLauncherService {
  listApps(): Promise<AppDescriptor[]>;
  launchByName(query: string): Promise<AppLaunchResult>;
}

export const mockAppLauncherService: IAppLauncherService = {
  async listApps() {
    return [
      { id: "vscode", name: "Visual Studio Code" },
      { id: "chrome", name: "Google Chrome" },
      { id: "spotify", name: "Spotify" },
      { id: "notepad", name: "Bloc-notes" },
    ];
  },
  async launchByName(query) {
    return {
      ok: false,
      message: `Lancement de "${query}" indisponible depuis le navigateur. À implémenter côté utilitaire Windows.`,
    };
  },
};
