# -*- coding: utf-8 -*-
"""
Diagnostic Nex - trouve pourquoi une app visible avec Get-StartApps
n'apparaît pas dans l'agent local.

Usage recommandé sur ton PC Windows :
    python diagnose_apps.py whatsapp snapchat --url http://127.0.0.1:17345 --token TON_TOKEN

Sans --url/--token, le script teste quand même Windows + PowerShell.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
import urllib.error
import urllib.request
from typing import Any


def normalize(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


def powershell_candidates() -> list[str]:
    windir = os.environ.get("WINDIR", r"C:\Windows")
    return [
        os.path.join(windir, "Sysnative", "WindowsPowerShell", "v1.0", "powershell.exe"),
        os.path.join(windir, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        "powershell",
    ]


def run_ps(exe: str, command: str, timeout: int = 15) -> tuple[int, str, str]:
    try:
        result = subprocess.run(
            [exe, "-NoProfile", "-NonInteractive", "-Command", command],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return result.returncode, result.stdout or "", result.stderr or ""
    except Exception as exc:
        return -1, "", repr(exc)


def parse_json_rows(stdout: str) -> list[dict[str, Any]]:
    if not stdout.strip():
        return []
    data = json.loads(stdout)
    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    return []


def find_matches(rows: list[dict[str, Any]], queries: list[str]) -> dict[str, list[dict[str, str]]]:
    out: dict[str, list[dict[str, str]]] = {q: [] for q in queries}
    for row in rows:
        name = str(row.get("Name") or row.get("name") or "")
        app_id = str(row.get("AppID") or row.get("AppId") or row.get("path") or row.get("Path") or "")
        haystack = normalize(name + " " + app_id)
        for q in queries:
            if normalize(q) in haystack:
                out[q].append({"name": name, "id_or_path": app_id})
    return out


def print_matches(title: str, rows: list[dict[str, Any]], queries: list[str]) -> bool:
    matches = find_matches(rows, queries)
    print(f"\n[{title}] total={len(rows)}")
    ok = False
    for q in queries:
        items = matches[q]
        if items:
            ok = True
            print(f"  [OK] {q}: {len(items)} résultat(s)")
            for item in items[:8]:
                print(f"     - {item['name']} | {item['id_or_path']}")
        else:
            print(f"  [X] {q}: aucun résultat")
    return ok


def get_start_apps(exe: str) -> tuple[list[dict[str, Any]], str]:
    cmd = (
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
        "Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress"
    )
    rc, stdout, stderr = run_ps(exe, cmd)
    if rc != 0:
        return [], f"rc={rc} stderr={stderr[:400]}"
    try:
        return parse_json_rows(stdout), "ok"
    except Exception as exc:
        return [], f"json_error={exc} stdout_preview={stdout[:400]!r}"


def get_appsfolder(exe: str) -> tuple[list[dict[str, Any]], str]:
    cmd = (
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
        "$shell = New-Object -ComObject Shell.Application; "
        "$folder = $shell.Namespace('shell:AppsFolder'); "
        "if ($null -eq $folder) { @() | ConvertTo-Json -Compress; exit } "
        "$folder.Items() | ForEach-Object { "
        "[PSCustomObject]@{ Name = $_.Name; AppID = $_.Path } "
        "} | ConvertTo-Json -Compress"
    )
    rc, stdout, stderr = run_ps(exe, cmd)
    if rc != 0:
        return [], f"rc={rc} stderr={stderr[:400]}"
    try:
        return parse_json_rows(stdout), "ok"
    except Exception as exc:
        return [], f"json_error={exc} stdout_preview={stdout[:400]!r}"


def call_agent_apps(url: str, token: str) -> tuple[list[dict[str, Any]], str]:
    request = urllib.request.Request(
        url.rstrip("/") + "/apps",
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            payload = json.loads(response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        return [], f"HTTP {exc.code}: {exc.read().decode('utf-8', errors='replace')[:400]}"
    except Exception as exc:
        return [], repr(exc)
    return list(payload.get("apps") or []), f"ok count={payload.get('count')} platform={payload.get('platform')}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("queries", nargs="*", default=["whatsapp", "snapchat"])
    parser.add_argument("--url", default=os.environ.get("NEX_AGENT_URL", ""))
    parser.add_argument("--token", default=os.environ.get("NEX_AGENT_TOKEN", ""))
    args = parser.parse_args()

    queries = args.queries or ["whatsapp", "snapchat"]
    print("=== Diagnostic Nex apps ===")
    print(f"Python: {sys.executable}")
    print(f"Version: {sys.version.split()[0]} | Arch: {platform.architecture()[0]} | Platform: {sys.platform}")
    print(f"Utilisateur: {os.environ.get('USERNAME') or os.environ.get('USER') or '?'}")

    startapps_seen = False
    appsfolder_seen = False
    used_ps = []
    for exe in powershell_candidates():
        if exe != "powershell" and not os.path.exists(exe):
            continue
        used_ps.append(exe)
        rows, status = get_start_apps(exe)
        print(f"\nPowerShell testé: {exe}")
        print(f"Get-StartApps status: {status}")
        startapps_seen = print_matches("Get-StartApps", rows, queries) or startapps_seen

        rows, status = get_appsfolder(exe)
        print(f"AppsFolder COM status: {status}")
        appsfolder_seen = print_matches("shell:AppsFolder", rows, queries) or appsfolder_seen

    if args.url and args.token:
        rows, status = call_agent_apps(args.url, args.token)
        print(f"\nAgent /apps status: {status}")
        agent_seen = print_matches("Agent /apps", rows, queries)
    else:
        agent_seen = False
        print("\n[Agent /apps] ignoré : ajoute --url et --token pour comparer avec l'agent lancé.")

    print("\n=== Verdict ===")
    if (startapps_seen or appsfolder_seen) and not agent_seen and args.url and args.token:
        print("Windows voit l'app, mais l'agent lancé ne la renvoie pas : tu utilises probablement un ancien agent.py, ou l'agent n'a pas été redémarré.")
    elif (startapps_seen or appsfolder_seen) and not args.url:
        print("Windows voit l'app. Lance maintenant avec --url et --token pour vérifier si l'agent HTTP la renvoie aussi.")
    elif not startapps_seen and not appsfolder_seen:
        print("Même Python/PowerShell ne voit pas l'app : le problème vient de la session Windows, du nom exact de l'app, ou des droits utilisateur.")
    else:
        print("L'agent voit l'app. Si Nex ne l'affiche pas, le problème est côté cache/interface web, pas côté Windows.")
    print(f"PowerShell utilisés: {used_ps}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())