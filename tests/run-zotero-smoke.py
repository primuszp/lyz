"""Run the current add-on in a fresh Zotero profile, optionally with isolated LyX.

The generated test XPI adds a bootstrap hook; the distributable XPI is untouched.
Only owned processes are stopped on exit. Profiles/results remain for inspection.
"""
import argparse
import contextlib
import json
import os
import pathlib
import subprocess
import tempfile
import time
import uuid
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("--zotero", required=True, type=pathlib.Path)
parser.add_argument("--timeout", type=int, default=120)
parser.add_argument("--windowed", action="store_true", help="Use hidden native windows instead of headless Gecko")
parser.add_argument("--lyx", type=pathlib.Path, help="Run the full installed Zotero/LyX lifecycle instead of mapping UI checks")
parser.add_argument("--lyx-userdir-template", type=pathlib.Path,
                    help="Copy generated LyX catalogs/defaults only; never sessions or user preferences")
parser.add_argument("--preferences", action="store_true",
                    help="With --lyx: check the preferences pane and connection test instead of the lifecycle")
parser.add_argument("--dark", action="store_true", help="Emulate the operating system dark theme")
parser.add_argument("--inspect-lyx", action="store_true", help="Show the isolated LyX window for interactive test diagnostics")
args = parser.parse_args()
if not args.zotero.is_file():
    parser.error("--zotero must name an installed executable")
if args.lyx and (os.name != "nt" or not args.lyx.is_file()):
    parser.error("--lyx requires an installed Windows executable")
if args.preferences and not args.lyx:
    parser.error("--preferences requires --lyx")
if args.timeout <= 0:
    parser.error("--timeout must be positive")
if args.lyx_userdir_template and not (args.lyx_userdir_template / "lyxrc.defaults").is_file():
    parser.error("--lyx-userdir-template must contain generated lyxrc.defaults")


def stop_process(process):
    if process.poll() is None:
        process.kill()
        process.wait(timeout=10)


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
if args.dark:
    prefs["ui.systemUsesDarkTheme"] = 1
lyx_process = None
lyx_log = None
if args.lyx:
    import shutil
    userdir = run / "lyx-userdir"
    userdir.mkdir()
    if args.lyx_userdir_template:
        for path in args.lyx_userdir_template.glob("*.lst"):
            shutil.copyfile(path, userdir / path.name)
        shutil.copyfile(args.lyx_userdir_template / "lyxrc.defaults", userdir / "lyxrc.defaults")
    pipe = "\\\\.\\pipe\\lyz-smoke-" + uuid.uuid4().hex
    (userdir / "preferences").write_text('Format 38\n\\serverpipe "' + pipe + '"\n', encoding="utf-8")
    prefs["extensions.lyz.lyxserver"] = pipe
    prefs["extensions.lyz.use_utf8"] = True
    prefs["extensions.lyz.citekey"] = "author year title"
    prefs["lyz.smoke.phase"] = "lifecycle"
    document = """#LyX 2.5 created this file. For more info see https://www.lyx.org/
\\lyxformat 643
\\begin_document
\\begin_header
\\textclass article
\\language english
\\inputencoding utf8
\\cite_engine basic
\\biblio_style plain
\\end_header
\\begin_body
\\begin_layout Standard
LyZ isolated lifecycle fixture.
\\end_layout
\\begin_layout Standard
\\begin_inset CommandInset bibtex
LatexCommand bibtex
btprint "btPrintCited"
bibfiles "%s"
options "plain"
\\end_inset
\\end_layout
\\end_body
\\end_document
"""
    for name, bibliography in [("Mester árvíztűrő", "közös könyvtár"), ("Gyermek tükörfúrógép", "közös könyvtár"), ("Másik dokumentum", "másik könyvtár")]:
        (run / (name + ".lyx")).write_text(document % (run / (bibliography + ".bib")).as_posix(), encoding="utf-8")
    (run / "másik könyvtár.bib").write_text("% Unrelated bibliography\n", encoding="utf-8")
(profile / "user.js").write_text("\n".join(
    f"user_pref({json.dumps(key)}, {json.dumps(value)});" for key, value in prefs.items()
), encoding="utf-8")
hook_name = ("tests/zotero-preferences-smoke.js" if args.preferences
             else "tests/zotero-lyx-runtime-smoke.js" if args.lyx else "tests/zotero-runtime-smoke.js")
hook = (root / hook_name).read_bytes()
with zipfile.ZipFile(extensions / "lyz@zotero.org.xpi", "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted((root / "addon").rglob("*")):
        if path.is_file():
            content = path.read_bytes()
            if path.name == "bootstrap.js":
                content += b"\n" + hook
            archive.writestr(path.relative_to(root / "addon").as_posix(), content)
print(f"Isolated test directory: {run}", flush=True)
result = run / "result.json"
with (run / "console.log").open("w", encoding="utf-8") as log, contextlib.ExitStack() as cleanup:
    startupinfo = None
    if os.name == "nt":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE
    command = [str(args.zotero), "--no-remote", "--profile", str(profile)]
    if not args.windowed:
        command.append("--headless")
    if args.lyx:
        lyx_log = (run / "lyx.log").open("w", encoding="utf-8")
        cleanup.callback(lyx_log.close)
        lyx_startupinfo = startupinfo
        if os.name == "nt" and args.inspect_lyx:
            lyx_startupinfo = subprocess.STARTUPINFO()
            lyx_startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            lyx_startupinfo.wShowWindow = 1
        lyx_process = subprocess.Popen([str(args.lyx), "-n", "-userdir", str(userdir),
            "-dbg", "lyxserver", str(run / "Mester árvíztűrő.lyx")],
            stdout=lyx_log, stderr=subprocess.STDOUT, startupinfo=lyx_startupinfo)
        cleanup.callback(stop_process, lyx_process)
        # Startup readiness is verified again by the test's real LyXServer request.
        deadline = time.monotonic() + 30
        while not pathlib.Path(pipe + ".in").exists() and lyx_process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.2)
    process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, startupinfo=startupinfo)
    cleanup.callback(stop_process, process)
    deadline = time.monotonic() + args.timeout
    restarted = False
    while process.poll() is None and not result.exists() and time.monotonic() < deadline:
        if args.lyx and not restarted and (run / "crash-ready.json").exists():
            # Stop only our isolated process at the durable prepared checkpoint.
            # A fresh instance must run the production startup recovery against the same DB/files.
            process.kill()
            process.wait()
            prefs["lyz.smoke.phase"] = "recover"
            (profile / "user.js").write_text("\n".join(
                f"user_pref({json.dumps(key)}, {json.dumps(value)});" for key, value in prefs.items()
            ), encoding="utf-8")
            print("Terminated isolated Zotero after first file replacement; restarting for recovery", flush=True)
            process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, startupinfo=startupinfo)
            cleanup.callback(stop_process, process)
            restarted = True
            deadline = time.monotonic() + args.timeout
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
