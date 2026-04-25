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


def _launch_windows_path(path: str, args: list[str], method: str) -> JSONResponse:
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
        "version": "1.1.0",
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
        if os.path.isabs(target) and os.path.exists(target):
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
            subprocess.Popen([resolved, *body.args])
            return JSONResponse({"ok": True, "method": "popen", "target": resolved})

        known_path = _resolve_known_windows_path(target)
        if known_path:
            return _launch_windows_path(known_path, body.args, "known-path")

        shortcut = _resolve_windows_shortcut_or_app(target)
        if shortcut:
            return _launch_windows_path(shortcut, body.args, "start-menu")

        # 3) Sur Windows, on tente start uniquement pour les URI schemes explicites.
        if sys.platform == "win32" and _looks_like_uri_target(target):
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
        # Préférence : .lnk > .exe (raccourcis sont plus propres à lancer)
        if prev["source"] != "lnk" and entry["source"] == "lnk":
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