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
                if ext not in {".lnk", ".url", ".exe"}:
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
    exact = entry in normalized_candidates
    fuzzy = any(len(c) >= 4 and (c in entry or entry in c) for c in normalized_candidates)
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
            if sys.platform == "win32":
                # os.startfile gère .exe, .lnk, dossiers, fichiers (ouvre avec l'app par défaut).
                os.startfile(target)  # type: ignore[attr-defined]
                return JSONResponse({"ok": True, "method": "startfile", "target": target})
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

        shortcut = _resolve_windows_shortcut_or_app(target)
        if shortcut:
            os.startfile(shortcut)  # type: ignore[attr-defined]
            return JSONResponse({"ok": True, "method": "start-menu", "target": shortcut})

        # 3) Sur Windows, on tente quand même start <name> (gère URI scheme + apps shell).
        if sys.platform == "win32":
            cmd = f'start "" {shlex.quote(target)}'
            subprocess.Popen(cmd, shell=True)
            return JSONResponse({"ok": True, "method": "shell-start", "target": target})

        raise HTTPException(status_code=404, detail=f"App '{target}' introuvable sur le PATH")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Échec du lancement : {e}")


if __name__ == "__main__":
    import uvicorn

    print(f"[nex-agent] écoute sur http://{HOST}:{PORT}")
    print(f"[nex-agent] origines CORS : {ORIGIN_PATTERNS}")
    print(f"[nex-agent] allowlist active : {bool(ALLOWLIST)} ({len(ALLOWLIST)} entrée(s))")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")