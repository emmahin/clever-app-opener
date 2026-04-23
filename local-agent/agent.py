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

from fastapi import FastAPI, Header, HTTPException, status
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


# ─────────────────── Endpoints ───────────────────
@app.get("/ping")
def ping(authorization: Optional[str] = Header(default=None)):
    """Vérifie que l'agent tourne et que le token est bon. Utilisé par l'app web pour tester."""
    _check_auth(authorization)
    return {
        "ok": True,
        "agent": "nex-local-agent",
        "version": "1.0.0",
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