"""
Nex Local Agent — petit serveur HTTP local pour ouvrir des applications Windows
à la demande de l'IA depuis l'app web Nex.

Architecture :
    [App web Nex (HTTPS)] --> http://127.0.0.1:17345 --> os.startfile / subprocess

Sécurité :
- N'écoute QUE sur 127.0.0.1 (jamais exposé sur le réseau).
- Authentification Bearer obligatoire (token statique, défini par toi).
- CORS autorisé pour l'origine de l'app Lovable (configurable).
- Liste blanche optionnelle d'applications (allowlist) — si vide, tout passe.

Lancement :
    pip install fastapi uvicorn pydantic
    python agent.py

Variables d'environnement (toutes optionnelles sauf NEX_AGENT_TOKEN) :
    NEX_AGENT_TOKEN     : token Bearer obligatoire (défini par toi, partagé avec l'app web)
    NEX_AGENT_PORT      : port d'écoute (défaut 17345)
    NEX_AGENT_HOST      : hôte d'écoute (défaut 127.0.0.1, NE PAS exposer sur 0.0.0.0)
    NEX_AGENT_ORIGINS   : origines CORS autorisées, séparées par des virgules
                          (défaut : https://*.lovable.app,https://*.lovableproject.com,http://localhost:5173)
    NEX_AGENT_ALLOWLIST : chemins/noms d'apps autorisés, séparés par des virgules
                          (vide = tout autorisé)
"""
from __future__ import annotations

import os
import re
import json
import shlex
import shutil
import subprocess
import sys
from typing import Optional
from glob import glob

from fastapi import FastAPI, Header, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# ─────────────────── Config ───────────────────
TOKEN = os.environ.get("NEX_AGENT_TOKEN", "").strip()
if not TOKEN:
    print(
        "[nex-agent] ERREUR : la variable NEX_AGENT_TOKEN doit être définie.\n"
        "Exemple : NEX_AGENT_TOKEN=monlongtokensecret python agent.py",
        file=sys.stderr,
    )
    sys.exit(1)

HOST = os.environ.get("NEX_AGENT_HOST", "127.0.0.1")
PORT = int(os.environ.get("NEX_AGENT_PORT", "17345"))

_default_origins = "https://*.lovable.app,https://*.lovableproject.com,http://localhost:5173,http://localhost:8080"
ORIGINS_RAW = os.environ.get("NEX_AGENT_ORIGINS", _default_origins).strip()
ORIGIN_PATTERNS = [o.strip() for o in ORIGINS_RAW.split(",") if o.strip()]
# Convert wildcards to regex-friendly form for allow_origin_regex
_regex_chunks = []
_static_origins = []
for o in ORIGIN_PATTERNS:
    if "*" in o:
        _regex_chunks.append(re.escape(o).replace(r"\*", r"[^/]*"))
    else:
        _static_origins.append(o)
ORIGIN_REGEX = "^(" + "|".join(_regex_chunks) + ")$" if _regex_chunks else None

ALLOWLIST_RAW = os.environ.get("NEX_AGENT_ALLOWLIST", "").strip()
ALLOWLIST = [a.strip().lower() for a in ALLOWLIST_RAW.split(",") if a.strip()]

# ─────────────────── App ───────────────────
app = FastAPI(title="Nex Local Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_static_origins,
    allow_origin_regex=ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["authorization", "content-type"],
)


@app.middleware("http")
async def private_network_access(request: Request, call_next):
    response: Response = await call_next(request)
    if request.headers.get("access-control-request-private-network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


def _check_auth(authorization: Optional[str]) -> None:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")
    provided = authorization.split(" ", 1)[1].strip()
    if provided != TOKEN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid token")


def _is_allowed(target: str) -> bool:
    if not ALLOWLIST:
        return True
    t = target.strip().lower()
    base = os.path.basename(t)
    name_no_ext, _ = os.path.splitext(base)
    return any(a in (t, base, name_no_ext) for a in ALLOWLIST)


def _resolve_windows_shortcut_or_app(target: str) -> Optional[str]:
    if sys.platform != "win32":
        return None

    candidates = _windows_query_candidates(target)
    if not candidates:
        return None

    start_menu_dirs = [
        os.path.join(os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs"),
        os.path.join(os.environ.get("PROGRAMDATA", ""), r"Microsoft\Windows\Start Menu\Programs"),
    ]

    fuzzy_match: Optional[str] = None

    for root in start_menu_dirs:
        if not root or not os.path.isdir(root):
            continue
        for dirpath, _, filenames in os.walk(root):
            for filename in filenames:
                lower = filename.lower()
                stem, ext = os.path.splitext(lower)
                # Les raccourcis .url ouvrent une page web dans le navigateur, pas une app PC.
                # Pour éviter les écrans Lovable/web vides, l'agent local ne les utilise pas
                # pour une demande de lancement d'application native.
                if ext not in {".lnk", ".exe"}:
                    continue
                path = os.path.join(dirpath, filename)
                exact, fuzzy = _matches_windows_entry(filename, candidates | {stem, lower})
                if exact:
                    return path
                if fuzzy and fuzzy_match is None:
                    fuzzy_match = path
    return fuzzy_match


WINDOWS_APP_ALIASES = {
    "chrome": ["google chrome", "chrome.exe"],
    "edge": ["microsoft edge", "msedge", "msedge.exe"],
    "firefox": ["mozilla firefox", "firefox.exe"],
    "brave": ["brave browser", "brave.exe"],
    "vscode": ["visual studio code", "code", "code.exe"],
    "vs code": ["visual studio code", "code", "code.exe"],
    "word": ["microsoft word", "winword", "winword.exe"],
    "excel": ["microsoft excel", "excel.exe"],
    "powerpoint": ["microsoft powerpoint", "powerpnt", "powerpnt.exe"],
    "outlook": ["microsoft outlook", "outlook.exe"],
    "teams": ["microsoft teams", "teams.exe", "ms-teams"],
    "discord": ["discord.exe"],
    "steam": ["steam.exe"],
    "spotify": ["spotify.exe", "spotify"],
    "whatsapp": ["whatsapp.exe", "whatsapp"],
    "telegram": ["telegram desktop", "telegram.exe"],
    "notion": ["notion.exe"],
    "obsidian": ["obsidian.exe"],
}

# Chemins probables pour les apps connues (style script utilisateur).
# Chaque entrée = liste de chemins (les variables d'env sont expansées).
# Les motifs avec * sont résolus via glob.
WINDOWS_KNOWN_APP_PATHS: dict[str, list[str]] = {
    "spotify": [
        r"%APPDATA%\Spotify\Spotify.exe",
        r"%LOCALAPPDATA%\Microsoft\WindowsApps\Spotify.exe",
        r"C:\Program Files\WindowsApps\SpotifyAB.SpotifyMusic_*\Spotify.exe",
    ],
    "discord": [
        r"%LOCALAPPDATA%\Discord\app-*\Discord.exe",
        r"%LOCALAPPDATA%\Discord\Update.exe",
    ],
    "vlc": [
        r"%PROGRAMFILES%\VideoLAN\VLC\vlc.exe",
        r"%PROGRAMFILES(X86)%\VideoLAN\VLC\vlc.exe",
    ],
    "obs": [
        r"%PROGRAMFILES%\obs-studio\bin\64bit\obs64.exe",
    ],
    "firefox": [
        r"%PROGRAMFILES%\Mozilla Firefox\firefox.exe",
        r"%PROGRAMFILES(X86)%\Mozilla Firefox\firefox.exe",
    ],
    "chrome": [
        r"%PROGRAMFILES%\Google\Chrome\Application\chrome.exe",
        r"%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe",
    ],
    "edge": [
        r"%PROGRAMFILES(X86)%\Microsoft\Edge\Application\msedge.exe",
        r"%PROGRAMFILES%\Microsoft\Edge\Application\msedge.exe",
    ],
    "brave": [
        r"%PROGRAMFILES%\BraveSoftware\Brave-Browser\Application\brave.exe",
        r"%PROGRAMFILES(X86)%\BraveSoftware\Brave-Browser\Application\brave.exe",
    ],
    "steam": [
        r"%PROGRAMFILES(X86)%\Steam\steam.exe",
        r"%PROGRAMFILES%\Steam\steam.exe",
    ],
    "epic": [
        r"%PROGRAMFILES%\Epic Games\Launcher\Engine\Binaries\Win64\EpicGamesLauncher.exe",
        r"%PROGRAMFILES(X86)%\Epic Games\Launcher\Engine\Binaries\Win64\EpicGamesLauncher.exe",
    ],
    "epic games": [
        r"%PROGRAMFILES%\Epic Games\Launcher\Engine\Binaries\Win64\EpicGamesLauncher.exe",
        r"%PROGRAMFILES(X86)%\Epic Games\Launcher\Engine\Binaries\Win64\EpicGamesLauncher.exe",
    ],
    "epic games launcher": [
        r"%PROGRAMFILES%\Epic Games\Launcher\Engine\Binaries\Win64\EpicGamesLauncher.exe",
        r"%PROGRAMFILES(X86)%\Epic Games\Launcher\Engine\Binaries\Win64\EpicGamesLauncher.exe",
    ],
    "gog": [
        r"%PROGRAMFILES(X86)%\GOG Galaxy\GalaxyClient.exe",
        r"%PROGRAMFILES%\GOG Galaxy\GalaxyClient.exe",
    ],
    "ea": [
        r"%PROGRAMFILES%\Electronic Arts\EA Desktop\EA Desktop\EADesktop.exe",
        r"%PROGRAMFILES%\EA\EA App\EADesktop.exe",
        r"%PROGRAMFILES(X86)%\Origin\Origin.exe",
    ],
    "ubisoft": [
        r"%PROGRAMFILES(X86)%\Ubisoft\Ubisoft Game Launcher\UbisoftConnect.exe",
        r"%PROGRAMFILES%\Ubisoft\Ubisoft Game Launcher\UbisoftConnect.exe",
    ],
    "battlenet": [
        r"%PROGRAMFILES(X86)%\Battle.net\Battle.net Launcher.exe",
        r"%PROGRAMFILES%\Battle.net\Battle.net Launcher.exe",
    ],
    "battle.net": [
        r"%PROGRAMFILES(X86)%\Battle.net\Battle.net Launcher.exe",
    ],
    "riot": [
        r"C:\Riot Games\Riot Client\RiotClientServices.exe",
    ],
    "notepad": [r"%WINDIR%\System32\notepad.exe"],
    "calc": [r"%WINDIR%\System32\calc.exe"],
    "calculator": [r"%WINDIR%\System32\calc.exe"],
    "calculatrice": [r"%WINDIR%\System32\calc.exe"],
    "paint": [r"%WINDIR%\System32\mspaint.exe"],
    "explorer": [r"%WINDIR%\explorer.exe"],
    "cmd": [r"%WINDIR%\System32\cmd.exe"],
}


def _resolve_known_app_alias(target: str) -> Optional[str]:
    """Cherche un chemin connu pour cible (alias style script utilisateur)."""
    if sys.platform != "win32":
        return None
    candidates = _windows_query_candidates(target)
    # On essaye d'abord des correspondances exactes sur clé d'alias,
    # puis on tente une correspondance "le mot-clé est contenu dans la cible".
    keys_to_try: list[str] = []
    for c in candidates:
        nc = _normalize_app_name(c)
        if nc and nc in WINDOWS_KNOWN_APP_PATHS:
            keys_to_try.append(nc)
    for key in WINDOWS_KNOWN_APP_PATHS.keys():
        if any(key in _normalize_app_name(c) for c in candidates):
            if key not in keys_to_try:
                keys_to_try.append(key)

    for key in keys_to_try:
        for raw_path in WINDOWS_KNOWN_APP_PATHS[key]:
            expanded = os.path.expandvars(raw_path)
            if "*" in expanded:
                matches = sorted(glob(expanded), reverse=True)
                for m in matches:
                    if os.path.exists(m):
                        return m
            elif os.path.exists(expanded):
                return expanded
    return None


def _resolve_via_registry_app_paths(target: str) -> Optional[str]:
    """Lit HKLM/HKCU\\...\\App Paths\\<name>.exe — le registre Windows officiel
    dans lequel la plupart des installateurs déclarent leur exécutable.
    """
    if sys.platform != "win32":
        return None
    try:
        import winreg  # type: ignore
    except Exception:
        return None

    candidates = _windows_query_candidates(target)
    names: list[str] = []
    for c in candidates:
        base = os.path.basename(c)
        if not base:
            continue
        if not base.lower().endswith(".exe"):
            base = base + ".exe"
        if base not in names:
            names.append(base)

    sub = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths"
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        try:
            root = winreg.OpenKey(hive, sub)
        except OSError:
            continue
        try:
            for name in names:
                try:
                    k = winreg.OpenKey(root, name)
                except OSError:
                    continue
                try:
                    path, _ = winreg.QueryValueEx(k, None)
                    if path and os.path.exists(path):
                        return path
                except OSError:
                    pass
                finally:
                    winreg.CloseKey(k)
        finally:
            winreg.CloseKey(root)
    return None


def _resolve_via_where(target: str) -> Optional[str]:
    """Utilise la commande Windows 'where' (équivalent de 'which')."""
    if sys.platform != "win32":
        return None
    candidates = _windows_query_candidates(target)
    tried: set[str] = set()
    for c in candidates:
        base = os.path.basename(c).strip()
        if not base:
            continue
        if not base.lower().endswith(".exe"):
            base = base + ".exe"
        if base in tried:
            continue
        tried.add(base)
        try:
            res = subprocess.run(
                ["where", base],
                capture_output=True, text=True, timeout=2,
            )
        except Exception:
            continue
        if res.returncode == 0 and res.stdout.strip():
            first = res.stdout.strip().splitlines()[0].strip()
            if first and os.path.exists(first):
                return first
    return None


def _normalize_app_name(value: str) -> str:
    value = os.path.basename(value.strip().lower())
    stem, ext = os.path.splitext(value)
    value = stem if ext in {".exe", ".lnk", ".url"} else value
    value = re.sub(r"[._\-]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _windows_query_candidates(target: str) -> set[str]:
    raw = target.strip().lower()
    base = os.path.basename(raw)
    stem, _ = os.path.splitext(base)
    candidates = {raw, base, stem, raw.removesuffix(".exe"), _normalize_app_name(raw)}
    for value in list(candidates):
        normalized = _normalize_app_name(value)
        candidates.add(normalized)
        candidates.update(WINDOWS_APP_ALIASES.get(normalized, []))
    return {c for c in candidates if c}


def _matches_windows_entry(filename: str, candidates: set[str]) -> tuple[bool, bool]:
    entry = _normalize_app_name(filename)
    normalized_candidates = {_normalize_app_name(c) for c in candidates}
    compact_entry = re.sub(r"\s+", "", entry)
    compact_candidates = {re.sub(r"\s+", "", c) for c in normalized_candidates}
    exact = entry in normalized_candidates or compact_entry in compact_candidates
    fuzzy = any(
        len(c) >= 4 and (c in entry or entry in c or re.sub(r"\s+", "", c) in compact_entry or compact_entry in re.sub(r"\s+", "", c))
        for c in normalized_candidates
    )
    return exact, fuzzy


def _resolve_known_windows_path(target: str) -> Optional[str]:
    if sys.platform != "win32":
        return None

    candidates = _windows_query_candidates(target)
    roots = [
        os.environ.get("PROGRAMFILES", ""),
        os.environ.get("PROGRAMFILES(X86)", ""),
        os.environ.get("LOCALAPPDATA", ""),
    ]
    known_paths = {
        "chrome": [r"Google\Chrome\Application\chrome.exe"],
        "google chrome": [r"Google\Chrome\Application\chrome.exe"],
        "edge": [r"Microsoft\Edge\Application\msedge.exe"],
        "microsoft edge": [r"Microsoft\Edge\Application\msedge.exe"],
        "msedge": [r"Microsoft\Edge\Application\msedge.exe"],
        "firefox": [r"Mozilla Firefox\firefox.exe"],
        "brave": [r"BraveSoftware\Brave-Browser\Application\brave.exe"],
        "steam": [r"Steam\steam.exe"],
        "code": [r"Microsoft VS Code\Code.exe", r"Programs\Microsoft VS Code\Code.exe"],
        "visual studio code": [r"Microsoft VS Code\Code.exe", r"Programs\Microsoft VS Code\Code.exe"],
    }

    for candidate in candidates:
        for relative in known_paths.get(_normalize_app_name(candidate), []):
            for root in roots:
                if not root:
                    continue
                path = os.path.join(root, relative)
                if os.path.exists(path):
                    return path
    return None


def _looks_like_uri_target(target: str) -> bool:
    if re.match(r"^[a-zA-Z]:[\\/]", target):
        return False
    return bool(re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target))


# ─────────────────── Stratégie Microsoft Store / UWP ───────────────────
# Beaucoup d'apps installées depuis le Store (WhatsApp, Snapchat, Instagram,
# Netflix, Xbox, TikTok, Telegram, …) n'ont pas de .exe accessible : elles
# vivent sous C:\Program Files\WindowsApps\* (protégé). On les lance via
# explorer.exe shell:AppsFolder\<PackageFamilyName>!App

_STORE_PFN_HINTS: dict[str, list[str]] = {
    # Mots-clés (déjà normalisés en minuscules sans extension) -> sous-chaînes
    # à chercher dans la sortie PowerShell `Get-AppxPackage`. On garde des
    # fragments larges pour matcher différentes versions/éditeurs.
    "whatsapp": ["whatsapp", "5319275a.whatsappdesktop"],
    "snapchat": ["snapchat"],
    "snappchat": ["snapchat"],
    "instagram": ["instagram"],
    "netflix": ["netflix"],
    "xbox": ["xbox", "xboxapp", "gamingapp"],
    "tiktok": ["tiktok"],
    "telegram": ["telegram"],
    "messenger": ["messenger", "facebookmessenger"],
    "facebook": ["facebook"],
    "twitter": ["twitter", "x.com"],
    "x": ["x.com", "twitter"],
    "spotify": ["spotifymusic", "spotifyab"],
    "amazon prime video": ["primevideo"],
    "prime video": ["primevideo"],
    "youtube": ["youtube"],
    "linkedin": ["linkedin"],
    "messages": ["messages"],
    "photos": ["photos", "windows.photos"],
    "calculator": ["windowscalculator"],
    "calculatrice": ["windowscalculator"],
    "store": ["windowsstore", "microsoftstore"],
    "microsoft store": ["windowsstore", "microsoftstore"],
    "paint": ["paint"],
    "settings": ["windows.immersivecontrolpanel"],
    "paramètres": ["windows.immersivecontrolpanel"],
}


def _resolve_microsoft_store_app(target: str) -> Optional[str]:
    """Renvoie une chaîne `shell:AppsFolder\\<PFN>!App` si l'app Store est trouvée."""
    if sys.platform != "win32":
        return None

    candidates = _windows_query_candidates(target)
    hint_terms: set[str] = set()
    for c in candidates:
        nc = _normalize_app_name(c)
        # Termes explicitement déclarés
        for terms in _STORE_PFN_HINTS.get(nc, []):
            hint_terms.add(terms.lower())
        # Sinon on tente le candidat lui-même comme sous-chaîne (≥4 caractères)
        if len(nc) >= 4:
            hint_terms.add(nc.replace(" ", ""))

    if not hint_terms:
        return None

    # PowerShell : récupère Name + PackageFamilyName de TOUS les paquets installés
    # (pour le user actuel). Format CSV simple pour parsing facile.
    ps_cmd = (
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
        "Get-AppxPackage | "
        "Select-Object -Property Name,PackageFamilyName | "
        "ForEach-Object { \"$($_.Name)|$($_.PackageFamilyName)\" }"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=8,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except Exception as e:
        print(f"[nex-agent] strategy=store-app powershell error: {e}", flush=True)
        return None

    if result.returncode != 0 or not result.stdout:
        print(f"[nex-agent] strategy=store-app powershell returned no data rc={result.returncode}", flush=True)
        return None

    best: Optional[str] = None
    for line in result.stdout.splitlines():
        if "|" not in line:
            continue
        name, pfn = line.split("|", 1)
        haystack = (name + " " + pfn).lower()
        if any(term in haystack for term in hint_terms):
            print(
                f"[nex-agent] strategy=store-app candidate name={name!r} pfn={pfn!r}",
                flush=True,
            )
            best = pfn.strip()
            break

    if not best:
        return None
    return f"shell:AppsFolder\\{best}!App"


def _launch_store_app(shell_target: str) -> JSONResponse:
    print(f"[nex-agent] launch store app target={shell_target!r}", flush=True)
    # explorer.exe est le seul moyen fiable de résoudre shell:AppsFolder
    subprocess.Popen(["explorer.exe", shell_target])
    return JSONResponse({"ok": True, "method": "store-app", "target": shell_target})


def _list_microsoft_store_apps() -> list[dict]:
    """Liste les apps UWP/MSIX installées (Microsoft Store et sideload).

    Retourne des entrées prêtes pour /apps avec un `path` directement utilisable
    par /launch (shell:AppsFolder\\<PFN>!<AppId>).
    """
    if sys.platform != "win32":
        return []

    # On veut le PackageFamilyName + le DisplayName lisible + l'AppId du tile.
    # Get-StartApps donne directement (Name, AppID) pour toutes les tuiles
    # visibles dans le menu Démarrer, y compris les apps Store et Win32.
    # On le filtre ensuite pour ne garder que les AppId au format "<PFN>!<id>".
    ps_cmd = (
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
        "Get-StartApps | "
        "ForEach-Object { \"$($_.Name)|$($_.AppID)\" }"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except Exception as e:
        print(f"[nex-agent] scan store-apps powershell error: {e}", flush=True)
        return []

    if result.returncode != 0 or not result.stdout:
        print(
            f"[nex-agent] scan store-apps returned no data rc={result.returncode} stderr={result.stderr[:200] if result.stderr else ''}",
            flush=True,
        )
        return []

    found: list[dict] = []
    seen: set[str] = set()
    for line in result.stdout.splitlines():
        line = line.strip()
        if "|" not in line:
            continue
        name, app_id = line.split("|", 1)
        name = name.strip()
        app_id = app_id.strip()
        if not name or not app_id:
            continue
        # Ne garder que les AppId UWP (contiennent '!'). Les autres sont des
        # raccourcis Win32 déjà couverts par le scan .lnk.
        if "!" not in app_id:
            continue
        # Filtre des apps système peu intéressantes
        low = name.lower()
        if low in {"get help", "get started", "tips", "feedback hub"}:
            continue
        path = f"shell:AppsFolder\\{app_id}"
        if path in seen:
            continue
        seen.add(path)
        found.append({"name": name, "path": path, "source": "store"})
    print(f"[nex-agent] scan store-apps found={len(found)}", flush=True)
    return found


def _launch_windows_path(path: str, args: list[str], method: str) -> JSONResponse:
    print(f"[nex-agent] launch resolved method={method} target={path} args={args}", flush=True)
    ext = os.path.splitext(path)[1].lower()
    if ext == ".exe":
        subprocess.Popen([path, *args])
    elif ext in {".bat", ".cmd"}:
        subprocess.Popen([path, *args], shell=True)
    elif ext in {".msi"}:
        subprocess.Popen(["msiexec", "/i", path, *args])
    else:
        os.startfile(path)  # type: ignore[attr-defined]
    return JSONResponse({"ok": True, "method": method, "target": path})


# ─────────────────── Endpoints ───────────────────
@app.get("/ping")
def ping(authorization: Optional[str] = Header(default=None)):
    """Vérifie que l'agent tourne et que le token est bon. Utilisé par l'app web pour tester."""
    _check_auth(authorization)
    return {
        "ok": True,
        "agent": "nex-local-agent",
        "version": "1.2.0",
        "platform": sys.platform,
        "allowlist_active": bool(ALLOWLIST),
    }


class LaunchBody(BaseModel):
    target: str = Field(..., description="Nom ou chemin de l'app à ouvrir (ex: 'notepad', 'C:\\\\Path\\\\To\\\\app.exe')")
    args: list[str] = Field(default_factory=list, description="Arguments optionnels à passer")


@app.post("/launch")
def launch(body: LaunchBody, authorization: Optional[str] = Header(default=None)):
    _check_auth(authorization)
    target = (body.target or "").strip()
    print(f"[nex-agent] launch request target={target!r} args={body.args}", flush=True)
    if not target:
        raise HTTPException(status_code=400, detail="Target is required")

    if not _is_allowed(target):
        raise HTTPException(
            status_code=403,
            detail=f"'{target}' n'est pas dans l'allowlist NEX_AGENT_ALLOWLIST",
        )

    # Refuse les caractères clairement dangereux dans target lui-même.
    if any(ch in target for ch in ["\n", "\r", "\0"]):
        raise HTTPException(status_code=400, detail="Invalid characters in target")

    try:
        # 1) Si c'est un chemin absolu existant → on lance directement.
        # 1-bis) Cas spécial : path Microsoft Store (shell:AppsFolder\<PFN>!App)
        if sys.platform == "win32" and target.lower().startswith("shell:appsfolder\\"):
            print(f"[nex-agent] strategy=store-app-direct target={target}", flush=True)
            return _launch_store_app(target)

        if os.path.isabs(target) and os.path.exists(target):
            print(f"[nex-agent] strategy=absolute-path matched target={target}", flush=True)
            ext = os.path.splitext(target)[1].lower()
            if sys.platform == "win32" and ext == ".url":
                raise HTTPException(
                    status_code=400,
                    detail="Ce raccourci .url ouvre une page web. Donne le nom de l'application ou le chemin du .exe/.lnk.",
                )
            if sys.platform == "win32":
                return _launch_windows_path(target, body.args, "path")
            elif sys.platform == "darwin":
                subprocess.Popen(["open", target, *body.args])
                return JSONResponse({"ok": True, "method": "open", "target": target})
            else:
                subprocess.Popen(["xdg-open", target])
                return JSONResponse({"ok": True, "method": "xdg-open", "target": target})

        # 2) Sinon, on cherche dans le PATH.
        resolved = shutil.which(target)
        if resolved:
            print(f"[nex-agent] strategy=path-which matched target={resolved}", flush=True)
            subprocess.Popen([resolved, *body.args])
            return JSONResponse({"ok": True, "method": "popen", "target": resolved})

        known_path = _resolve_known_windows_path(target)
        if known_path:
            print(f"[nex-agent] strategy=known-path matched target={known_path}", flush=True)
            return _launch_windows_path(known_path, body.args, "known-path")

        # Stratégies inspirées du script utilisateur :
        # alias avec chemins probables → registre App Paths → commande 'where'
        alias_path = _resolve_known_app_alias(target)
        if alias_path:
            print(f"[nex-agent] strategy=alias-path matched target={alias_path}", flush=True)
            return _launch_windows_path(alias_path, body.args, "alias-path")

        registry_path = _resolve_via_registry_app_paths(target)
        if registry_path:
            print(f"[nex-agent] strategy=registry-app-paths matched target={registry_path}", flush=True)
            return _launch_windows_path(registry_path, body.args, "registry-app-paths")

        where_path = _resolve_via_where(target)
        if where_path:
            print(f"[nex-agent] strategy=where matched target={where_path}", flush=True)
            return _launch_windows_path(where_path, body.args, "where")

        shortcut = _resolve_windows_shortcut_or_app(target)
        if shortcut:
            print(f"[nex-agent] strategy=start-menu matched target={shortcut}", flush=True)
            return _launch_windows_path(shortcut, body.args, "start-menu")

        # Apps Microsoft Store (WhatsApp, Snapchat, Instagram, Netflix, Xbox…)
        store_target = _resolve_microsoft_store_app(target)
        if store_target:
            print(f"[nex-agent] strategy=store-app matched target={store_target}", flush=True)
            return _launch_store_app(store_target)

        # 3) Sur Windows, on tente start uniquement pour les URI schemes explicites.
        if sys.platform == "win32" and _looks_like_uri_target(target):
            print(f"[nex-agent] strategy=shell-start-uri matched target={target}", flush=True)
            cmd = f'start "" {shlex.quote(target)}'
            subprocess.Popen(cmd, shell=True)
            return JSONResponse({"ok": True, "method": "shell-start", "target": target})

        raise HTTPException(
            status_code=404,
            detail=f"App '{target}' introuvable. Essaie le nom exact du raccourci Windows ou le chemin complet du .exe",
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[nex-agent] launch error target={target!r} error={e}", flush=True)
        raise HTTPException(status_code=500, detail=f"Échec du lancement : {e}")


# ─────────────────── /apps : scan complet du PC ───────────────────
def _scan_dir_for_apps(root: str, exts: set[str], max_depth: int = 4) -> list[dict]:
    """Scan récursif (profondeur limitée) à la recherche d'exécutables / raccourcis."""
    found: list[dict] = []
    if not root or not os.path.isdir(root):
        return found
    root = os.path.abspath(root)
    base_depth = root.rstrip(os.sep).count(os.sep)
    try:
        for dirpath, dirnames, filenames in os.walk(root):
            depth = dirpath.count(os.sep) - base_depth
            if depth > max_depth:
                dirnames[:] = []
                continue
            # Évite des dossiers bruyants/inutiles
            dirnames[:] = [
                d for d in dirnames
                if not d.startswith(".")
                and d.lower() not in {
                    "node_modules", "$recycle.bin", "windowsapps",
                    "installer", "uninstall", "uninstallers",
                    "cache", "logs", "crashpad", "temp", "tmp",
                    "drivers", "system32", "syswow64", "winsxs",
                }
            ]
            for filename in filenames:
                ext = os.path.splitext(filename)[1].lower()
                if ext not in exts:
                    continue
                stem = os.path.splitext(filename)[0]
                # Skip uninstallers / helpers évidents
                low = stem.lower()
                if any(k in low for k in ("uninstall", "unins", "setup", "installer", "crashhandler", "crashpad", "updater")):
                    continue
                full = os.path.join(dirpath, filename)
                found.append({
                    "name": stem,
                    "path": full,
                    "source": ext.lstrip("."),
                })
    except Exception:
        pass
    return found


def _list_windows_apps() -> list[dict]:
    candidates: list[dict] = []

    # 1) Menus Démarrer (raccourcis .lnk) — la source la plus fiable
    start_menu_dirs = [
        os.path.join(os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs"),
        os.path.join(os.environ.get("PROGRAMDATA", ""), r"Microsoft\Windows\Start Menu\Programs"),
    ]
    for d in start_menu_dirs:
        candidates += _scan_dir_for_apps(d, {".lnk"}, max_depth=6)

    # 2) Bureaux (raccourcis posés par l'utilisateur)
    desktops = [
        os.path.join(os.environ.get("USERPROFILE", ""), "Desktop"),
        os.path.join(os.environ.get("PUBLIC", ""), "Desktop"),
        os.path.join(os.environ.get("ONEDRIVE", ""), "Desktop"),
    ]
    for d in desktops:
        candidates += _scan_dir_for_apps(d, {".lnk", ".exe"}, max_depth=2)

    # 2-bis) Barre des tâches (apps épinglées) + Quick Launch
    appdata = os.environ.get("APPDATA", "")
    taskbar_dirs = [
        os.path.join(appdata, r"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"),
        os.path.join(appdata, r"Microsoft\Internet Explorer\Quick Launch\User Pinned\StartMenu"),
        os.path.join(appdata, r"Microsoft\Internet Explorer\Quick Launch"),
    ]
    for d in taskbar_dirs:
        candidates += _scan_dir_for_apps(d, {".lnk"}, max_depth=2)

    # 3) Dossiers d'install courants (.exe)
    install_roots = [
        os.environ.get("PROGRAMFILES", ""),
        os.environ.get("PROGRAMFILES(X86)", ""),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WindowsApps"),
    ]
    for d in install_roots:
        candidates += _scan_dir_for_apps(d, {".exe"}, max_depth=4)

    # 4) Dossiers Téléchargements (.exe / installateurs portables)
    downloads = [
        os.path.join(os.environ.get("USERPROFILE", ""), "Downloads"),
        os.path.join(os.environ.get("USERPROFILE", ""), "Téléchargements"),
    ]
    for d in downloads:
        candidates += _scan_dir_for_apps(d, {".exe"}, max_depth=2)

    # 5) Bibliothèques de jeux (Steam / Epic / Riot)
    game_roots = [
        r"C:\Program Files (x86)\Steam\steamapps\common",
        r"C:\Program Files\Epic Games",
        r"C:\Riot Games",
        r"C:\XboxGames",
    ]
    for d in game_roots:
        candidates += _scan_dir_for_apps(d, {".exe"}, max_depth=4)

    # 6) Apps Microsoft Store / UWP (WhatsApp, Snapchat, Instagram, Netflix…)
    candidates += _list_microsoft_store_apps()

    # Dédup par nom normalisé (préfère le .lnk si dispo)
    by_key: dict[str, dict] = {}
    for entry in candidates:
        key = _normalize_app_name(entry["name"])
        if not key or len(key) < 2:
            continue
        prev = by_key.get(key)
        if prev is None:
            by_key[key] = entry
            continue
        # Préférence : store > lnk > exe (les apps Store n'ont pas de .exe lançable)
        priority = {"store": 3, "lnk": 2, "exe": 1}
        if priority.get(entry["source"], 0) > priority.get(prev["source"], 0):
            by_key[key] = entry

    apps = list(by_key.values())
    apps.sort(key=lambda e: e["name"].lower())
    return apps


@app.get("/apps")
def list_apps(authorization: Optional[str] = Header(default=None)):
    """Renvoie la liste des applications détectées sur le PC."""
    _check_auth(authorization)
    if sys.platform != "win32":
        # Stub minimal pour macOS/Linux : on liste /Applications ou /usr/share/applications
        apps: list[dict] = []
        if sys.platform == "darwin":
            for root in ["/Applications", os.path.expanduser("~/Applications")]:
                if os.path.isdir(root):
                    for name in os.listdir(root):
                        if name.endswith(".app"):
                            apps.append({
                                "name": os.path.splitext(name)[0],
                                "path": os.path.join(root, name),
                                "source": "app",
                            })
        else:
            for root in ["/usr/share/applications", os.path.expanduser("~/.local/share/applications")]:
                if os.path.isdir(root):
                    for name in os.listdir(root):
                        if name.endswith(".desktop"):
                            apps.append({
                                "name": os.path.splitext(name)[0],
                                "path": os.path.join(root, name),
                                "source": "desktop",
                            })
        apps.sort(key=lambda e: e["name"].lower())
        return {"ok": True, "platform": sys.platform, "count": len(apps), "apps": apps}

    apps = _list_windows_apps()
    return {"ok": True, "platform": sys.platform, "count": len(apps), "apps": apps}


if __name__ == "__main__":
    import uvicorn

    print(f"[nex-agent] écoute sur http://{HOST}:{PORT}")
    print(f"[nex-agent] origines CORS : {ORIGIN_PATTERNS}")
    print(f"[nex-agent] allowlist active : {bool(ALLOWLIST)} ({len(ALLOWLIST)} entrée(s))")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")