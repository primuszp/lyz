# Mapping manager: installed Zotero smoke test

Verified on **2026-09-27**, Windows, Zotero **10.0.1**, Gecko **140.14.0**, Hungarian locale. This checks the current unreleased source, not a released 5.1.0 package.

## Reproduce

```powershell
python tests/run-zotero-smoke.py --zotero 'C:\Program Files\Zotero\zotero.exe'
```

The runner creates a new temporary profile and data directory for every invocation. Its generated XPI contains the production add-on plus a test-only bootstrap hook from `tests/zotero-runtime-smoke.js`. The distributable XPI is unchanged by the hook. Sync, extension updates, first-run welcome navigation, and automatic Word/LibreOffice integration installation are disabled in this profile. It does not open the normal Zotero profile or library.

The default runs headless; `--windowed` uses native windows hidden at Windows process launch. Results and console output remain in the printed temporary directory. The runner stops only the process it launches on timeout or after a result if graceful exit stalls. No results means failure, never a passing test.

## Result

**14 native checks passed**, covering:

- schema initialization with Zotero's actual `DBConnection`;
- inventory with native SQLite and `IOUtils`;
- loading the native XHTML dialog and passing its bootstrap API;
- Hungarian Fluent title and dialog CSS;
- resolution of the toolbar stylesheet through a supported chrome registration;
- singleton window reuse;
- relink preview with native file hashing and a Unicode Windows target;
- canonical path commit and preservation of the original mapping;
- acknowledgment before saving;
- cancel preserving active mappings;
- removal and archival in an actual SQLite transaction;
- unchanged LyX/BibTeX bytes;
- close and reopen.

The latest successful run produced `result.json` in `lyz-zotero-smoke-r47is8mq`, rechecking all 14 cases after the Windows filesystem path fix. All **126 Node regression tests** also passed.

## Defect found and fixed

Before the fix, `openDialog()` returned an uninitialized `about:blank` window. Startup had not called `registerChrome()`, and dialog URLs pointed directly into the XPI rather than to registered chrome content. Calling the existing registration also exposed an unsupported `skin` directive (`NS_ERROR_ILLEGAL_VALUE`). Startup now registers supported content/locale resources, native dialogs use `chrome://lyz/content/`, and toolbar styles/icons use a separate content registration.

Resource registration follows the [Zotero developer documentation](https://www.zotero.org/support/dev/zotero_7_for_developers#chromemanifest_runtime_chrome_registration).

## Remaining release checks

This is an automated application integration test, not a pixel review or a manual interaction test. Relinking supplies a fixture file choice instead of showing the interactive file picker. Keyboard navigation, picker cancellation, long-path layout, light/dark visual review, other supported Zotero versions and macOS/Linux remain pending. This mapping test does not exercise LyX or citation-key rewrites; the separate installed Windows lifecycle now passes 31 checks. See [ZOTERO_LYX_RUNTIME_TEST.md](ZOTERO_LYX_RUNTIME_TEST.md) and [KEY_UPDATE_TESTING.md](KEY_UPDATE_TESTING.md).
