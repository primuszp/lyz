"""Run the current add-on in a fresh, disposable, headless Zotero profile.

The generated test XPI adds a bootstrap hook; the distributable XPI is untouched.
Only this process is stopped on timeout. Profiles/results remain for inspection.
"""
import argparse
import json
import os
import pathlib
import subprocess
import tempfile
import time
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("--zotero", required=True, type=pathlib.Path)
parser.add_argument("--timeout", type=int, default=120)
parser.add_argument("--windowed", action="store_true", help="Use hidden native windows instead of headless Gecko")
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parent.parent
run = pathlib.Path(tempfile.mkdtemp(prefix="lyz-zotero-smoke-"))
profile = run / "profile"
data = run / "data"
extensions = profile / "extensions"
extensions.mkdir(parents=True)
data.mkdir()
prefs = {
    "extensions.zotero.useDataDir": True,
    "extensions.zotero.dataDir": str(data),
    "extensions.zotero.firstRun": False,
    "extensions.zotero.firstRun2": False,
    "extensions.zotero.automaticScraperUpdates": False,
    "extensions.zotero.debug.log": True,
    "extensions.zotero.sync.autoSync": False,
    "extensions.zoteroOpenOfficeIntegration.skipInstallation": True,
    "extensions.zoteroWinWordIntegration.skipInstallation": True,
    "extensions.lyz.checkZotero5Migration": False,
    "extensions.autoDisableScopes": 0,
    "extensions.startupScanScopes": 15,
    "extensions.update.enabled": False,
    "xpinstall.signatures.required": False,
    "app.update.auto": False,
    "intl.locale.requested": "hu-HU",
    "lyz.smoke.directory": str(run),
}
(profile / "user.js").write_text("\n".join(
    f"user_pref({json.dumps(key)}, {json.dumps(value)});" for key, value in prefs.items()
), encoding="utf-8")
hook = (root / "tests/zotero-runtime-smoke.js").read_bytes()
with zipfile.ZipFile(extensions / "lyz@zotero.org.xpi", "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted((root / "addon").rglob("*")):
        if path.is_file():
            content = path.read_bytes()
            if path.name == "bootstrap.js":
                content += b"\n" + hook
            archive.writestr(path.relative_to(root / "addon").as_posix(), content)
print(f"Isolated test directory: {run}", flush=True)
result = run / "result.json"
with (run / "console.log").open("w", encoding="utf-8") as log:
    startupinfo = None
    if os.name == "nt":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE
    command = [str(args.zotero), "--no-remote", "--profile", str(profile)]
    if not args.windowed:
        command.append("--headless")
    process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, startupinfo=startupinfo)
    deadline = time.monotonic() + args.timeout
    while process.poll() is None and not result.exists() and time.monotonic() < deadline:
        time.sleep(0.2)
    if process.poll() is None:
        try:
            process.wait(timeout=5 if result.exists() else 0)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    if not result.exists() and time.monotonic() >= deadline:
        raise SystemExit(f"Zotero smoke test timed out; inspect {run}")
if not result.exists():
    raise SystemExit(f"No result from Zotero (exit {process.returncode}); inspect {run}")
report = json.loads(result.read_text(encoding="utf-8"))
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(0 if report.get("passed") else 1)
