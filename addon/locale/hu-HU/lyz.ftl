### LyZ — Zotero plugin for LyX integration
### Locale: Hungarian (hu-HU)

## Menu labels

lyz-menu-label =
    .label = LyZ

lyz-toolbar-button =
    .tooltiptext = LyZ

lyz-cite-label =
    .label = Hivatkozás LyX-be
    .tooltiptext = Hivatkozás küldése LyX-be

lyz-update-bibtex-label =
    .label = BibTeX frissítése
    .tooltiptext = Módosított elemek frissítése a BibTeX fájlban

lyz-delete-bib-label =
    .label = BibTeX bejegyzés törlése…

lyz-delete-doc-label =
    .label = LyX dokumentum bejegyzés törlése…

lyz-rename-bib-label =
    .label = BibTeX bejegyzés átnevezése…

lyz-rename-doc-label =
    .label = LyX dokumentum bejegyzés átnevezése…

lyz-settings-label =
    .label = Beállítások…

lyz-test-label =
    .label = LyX parancs…

## Preferences panel

lyz-pref-lyxserver-group =
    .aria-label = LyX szerver

lyz-pref-lyxserver-heading = LyX szerver

lyz-pref-pipe-path =
    .value = Cső elérési útja

lyz-pref-save-settings =
    .label = Beállítások mentése

lyz-pref-server-description = Windows alapértelmezett: \\.\pipe\lyxpipe. Linux/macOS példák általában lyxpipe-ra végződnek.

lyz-pref-citation-keys-group =
    .aria-label = Hivatkozási kulcsok

lyz-pref-citation-keys-heading = Hivatkozási kulcsok

lyz-pref-key-source =
    .value = Kulcs forrása

lyz-pref-citekey-mode-custom =
    .label = Egyéni minta

lyz-pref-citekey-mode-zotero =
    .label = Zotero könyvtár/kulcs

lyz-pref-citekey-mode-zotero-short =
    .label = Csak Zotero elem kulcs

lyz-pref-citekey-mode-translator =
    .label = Fordító által generált

lyz-pref-custom-pattern =
    .value = Egyéni minta

lyz-pref-custom-pattern-desc = Szóközzel elválasztott kulcsszavak: author year title zotero zoteroShort. Például: author _ title _ year.

lyz-pref-bibtex-export-group =
    .aria-label = BibTeX export

lyz-pref-bibtex-export-heading = BibTeX export

lyz-pref-export-translator =
    .value = Export fordító

lyz-pref-journal-abbrev =
    .label = Folyóirat rövidítések használata

lyz-pref-bibtex-translators-desc = Az alapértelmezett Zotero telepítés általában tartalmazza a BibTeX-et. Ha további BibTeX-kompatibilis exporterek vannak telepítve, azok itt jelennek meg.

lyz-pref-settings-saved = Beállítások mentve: { $server }

## Dialog messages — LyX document / BibTeX selection

lyz-msg-select-citation = Kérjük, válasszon legalább egy hivatkozást.

lyz-msg-no-bibtex-for-doc =
    Az aktív LyX dokumentumhoz nincs BibTeX adatbázis rendelve:
    { $doc }

lyz-msg-could-not-retrieve-doc = Nem sikerült lekérni a dokumentum nevét.

lyz-msg-file-not-exist = A megadott { $doc } fájl nem létezik.

lyz-msg-report-error =
    Kérjük, jelezze az alábbi hibát:
    { $error }

lyz-msg-updating-doc = { $doc } frissítése

lyz-msg-backup-failed = A mentés sikertelen.

lyz-msg-file-path-not-exist = A { $path } fájl nem létezik.

lyz-msg-select-bibtex-new =
    OK – új BibTeX adatbázis létrehozása.
    Mégse – meglévő adatbázisok közül választ.

lyz-msg-select-bibtex-new-title = LyZ BibTeX adatbázis

lyz-msg-select-bibtex-file = BibTeX fájl kiválasztása a következőhöz: { $doc }

lyz-msg-bibtex-filter = BibTeX

lyz-msg-select-lyx-doc = LyX dokumentum kiválasztása a következőhöz: { $doc }

lyz-msg-lyx-filter = LyX

lyz-msg-bibtex-missing =
    Aktív LyX dokumentum:
    { $doc }
    { "" }
    A LyZ ehhez a BibTeX adatbázishoz kapcsolja, de a fájl hiányzik:
    { $bib }
    { "" }
    OK – a hiányzó BibTeX fájl újralétrehozása a LyZ bejegyzésekből.
    Mégse – másik BibTeX adatbázis választása vagy létrehozása.

lyz-msg-bibtex-missing-title = LyZ BibTeX adatbázis hiányzik

lyz-msg-bibtex-exists =
    Aktív LyX dokumentum:
    { $doc }
    { "" }
    A LyZ jelenleg ehhez a BibTeX adatbázishoz kapcsolja:
    { $bib }
    { "" }
    OK – ezt a BibTeX adatbázist használja.
    Mégse – másik BibTeX adatbázis választása vagy létrehozása.

lyz-msg-bibtex-exists-title = LyZ BibTeX adatbázis

lyz-msg-record-changed =
    A Zotero bejegyzés megváltozott.
    OK – „BibTeX frissítése" futtatása és a hivatkozás beillesztése.
    Mégse – semmilyen művelet nem hajtódik végre.

lyz-msg-record-changed-title = Zotero bejegyzés megváltozott!

## Dialog messages — BibTeX update

lyz-msg-confirm-update-bibtex =
    A BibTeX adatbázis frissítése:
    { "" }
    { $bib }
    { "" }
    Az aktuális BibTeX kulcsformátum „{ $citekey }" lesz használva.
    Folytatja?

lyz-msg-no-valid-items =
    Nem találhatók érvényes Zotero elemek ehhez a BibTeX adatbázishoz.
    { "" }
    A LyZ adatbázis elavult bejegyzéseket tartalmazhat egy régebbi vagy hibás BibTeX fejlécből.

lyz-msg-aborting = Megszakítás

lyz-msg-confirm-update-lyx-docs =
    A { $bib } BibTeX adatbázis frissítve.
    Frissíteni kívánja a kapcsolódó LyX dokumentumokat is?
    Ez csak akkor szükséges, ha szerző, cím vagy év módosult,
    vagy ha a BibTeX kulcsformátum megváltozott.

lyz-msg-items-changed = { $count } elem megváltozott vagy hozzáadva.

## Dialog messages — database record management

lyz-msg-confirm-delete-bib =
    Törli a BibTeX adatbázis bejegyzését:
    { $bib }
    A kapcsolódó dokumentumok bejegyzései szintén törlődnek.

lyz-msg-confirm-delete-bib-title = LyZ adatbázis bejegyzés törlése

lyz-msg-confirm-delete-doc =
    Valóban törli a következő dokumentum LyZ adatbázis bejegyzését?
    { $doc }

## Dialog messages — LyX command test

lyz-cmd-title = LyZ parancs

lyz-cmd-prompt = Parancs

lyz-cmd-default = server-get-filename

lyz-cmd-no-command = Nincs LyX parancs megadva.

lyz-cmd-no-response = Nincs válasz a LyX szervertől.

lyz-cmd-response =
    LyX válasz a következőre: { $command }:
    { "" }
    { $parsed }

lyz-cmd-empty-response =
    LyX válaszolt a { $command } parancsra, de üres értéket adott vissza.
    { "" }
    Ha ez server-get-filename volt, győződjön meg arról, hogy a LyX dokumentum el van mentve és aktív.

lyz-cmd-raw-response =
    Nyers LyX válasz a következőre: { $command }:
    { "" }
    { $response }

lyz-cmd-error =
    Hiba a lyxserver csatlakozásakor...
    { $error }
    Kérjük, próbálja újra.

## Dialog messages — Zotero 5 migration

lyz-msg-migration-title = LyZ: örökölt adatbázis észlelve

lyz-msg-migration-body =
    A LyZ Zotero 4.0 bejegyzéseket talált az adatbázisában. Ezek megakadályozzák, hogy a LyZ .bib fájlt hozzon létre. Szeretné, hogy a LyZ megpróbálja frissíteni a bejegyzéseket Zotero 5 elemekre? Érdemes biztonsági másolatot készíteni a Zotero adatkönyvtárról. Az elérhető a Zotero beállítások Speciális részében a „Fájlok és mappák" alatt. Egyes hivatkozási kulcsok változhatnak a folyamat során.

lyz-msg-migration-checkbox = Ne jelenjen meg ez a kérés a jövőben

lyz-msg-migration-reset =
    A párbeszéd újbóli megjelenítéséhez állítsa vissza az extensions.lyz.checkZotero5Migration értéket a Zotero speciális beállításaiban elérhető konfigurációs szerkesztőben.

lyz-msg-migration-start =
    A LyZ adatbázis migráció most kezdődik. Ne zárja be a Zotero-t, amíg a LyZ nem jelzi a migráció befejezését.

lyz-msg-migration-complete = LyZ migráció kész. Nem változott meg egyetlen hivatkozási kulcs sem.

## LyX Server error messages

lyz-server-title = LyZ szerver

lyz-server-no-contact = Nem sikerült kapcsolatba lépni a szerverrel: { $path }

lyz-server-error =
    HIBA: lyxGetDoc:
    { "" }
    { $response }

lyz-server-no-filename =
    LyX válaszolt, de nem adott vissza aktív fájlnevet.
    { "" }
    Győződjön meg arról, hogy a LyX dokumentum el van mentve és a dokumentum ablaka aktív.

lyz-server-pipe-not-exist = A megadott LyXServer cső nem létezik.

lyz-server-wrong-path =
    Helytelen elérési út a LyX szerverhez:
    { $path }
    { $error }

lyz-server-wrong-path-hint =
    Helytelen elérési út a LyX szerverhez.
    Adja meg a LyX beállításokban megadott elérési utat.

lyz-server-command-failed = Sikertelen: { $command }

lyz-server-error-general =
    SZERVERHIBA:
    { $error }
