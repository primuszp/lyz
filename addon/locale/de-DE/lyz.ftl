### LyZ — Zotero plugin for LyX integration
### Locale: German (de-DE)

## Menu labels

lyz-menu-label =
    .label = LyZ

lyz-toolbar-button =
    .tooltiptext = LyZ

lyz-cite-label =
    .label = In LyX zitieren
    .tooltiptext = Zitat an LyX senden

lyz-update-bibtex-label =
    .label = BibTeX aktualisieren
    .tooltiptext = Geänderte Einträge in der BibTeX-Datei aktualisieren

lyz-delete-bib-label =
    .label = BibTeX-Eintrag löschen…

lyz-delete-doc-label =
    .label = LyX-Dokument-Eintrag löschen…

lyz-rename-bib-label =
    .label = BibTeX-Eintrag umbenennen…

lyz-rename-doc-label =
    .label = LyX-Dokument-Eintrag umbenennen…

lyz-settings-label =
    .label = Einstellungen…

lyz-test-label =
    .label = LyX-Befehl…

## Preferences panel

lyz-pref-lyxserver-group =
    .aria-label = LyX-Server

lyz-pref-lyxserver-heading = LyX-Server

lyz-pref-pipe-path =
    .value = Pipe-Pfad

lyz-pref-save-settings =
    .label = Einstellungen speichern

lyz-pref-server-description = Windows-Standard: \\.\pipe\lyxpipe. Linux/macOS-Beispiele enden normalerweise auf lyxpipe.

lyz-pref-citation-keys-group =
    .aria-label = Zitierschlüssel

lyz-pref-citation-keys-heading = Zitierschlüssel

lyz-pref-key-source =
    .value = Schlüsselquelle

lyz-pref-citekey-mode-custom =
    .label = Benutzerdefiniertes Muster

lyz-pref-citekey-mode-zotero =
    .label = Zotero-Bibliothek/Schlüssel

lyz-pref-citekey-mode-zotero-short =
    .label = Nur Zotero-Elementschlüssel

lyz-pref-citekey-mode-translator =
    .label = Vom Übersetzer generiert

lyz-pref-custom-pattern =
    .value = Benutzerdefiniertes Muster

lyz-pref-custom-pattern-desc = Schlüsselwörter durch Leerzeichen getrennt: author year title zotero zoteroShort. Beispiel: author _ title _ year.

lyz-pref-bibtex-export-group =
    .aria-label = BibTeX-Export

lyz-pref-bibtex-export-heading = BibTeX-Export

lyz-pref-export-translator =
    .value = Export-Übersetzer

lyz-pref-journal-abbrev =
    .label = Zeitschriftenabkürzungen verwenden

lyz-pref-bibtex-translators-desc = Die Standard-Zotero-Installation enthält normalerweise BibTeX. Weitere BibTeX-kompatible Exporter erscheinen hier, sofern installiert.

lyz-pref-settings-saved = Einstellungen gespeichert: { $server }

## Dialog messages — LyX document / BibTeX selection

lyz-msg-select-citation = Bitte mindestens ein Zitat auswählen.

lyz-msg-no-bibtex-for-doc =
    Dem aktiven LyX-Dokument ist keine BibTeX-Datenbank zugeordnet:
    { $doc }

lyz-msg-could-not-retrieve-doc = Dokumentname konnte nicht abgerufen werden.

lyz-msg-file-not-exist = Die angegebene Datei { $doc } existiert nicht.

lyz-msg-report-error =
    Bitte melden Sie folgenden Fehler:
    { $error }

lyz-msg-updating-doc = Aktualisiere { $doc }

lyz-msg-backup-failed = Sicherung fehlgeschlagen.

lyz-msg-file-path-not-exist = Datei { $path } existiert nicht.

lyz-msg-select-bibtex-new =
    OK drücken, um eine neue BibTeX-Datenbank zu erstellen.
    Abbrechen drücken, um aus vorhandenen Datenbanken auszuwählen.

lyz-msg-select-bibtex-new-title = LyZ BibTeX-Datenbank

lyz-select-record-prompt = Wählen Sie einen Eintrag aus.

lyz-select-no-records = Es sind keine Einträge zur Auswahl vorhanden.

lyz-msg-select-bibtex-file = BibTeX-Datei für { $doc } auswählen

lyz-msg-bibtex-filter = BibTeX

lyz-msg-select-lyx-doc = LyX-Dokument für { $doc } auswählen

lyz-msg-lyx-filter = LyX

lyz-msg-bibtex-missing =
    Aktives LyX-Dokument:
    { $doc }
    { "" }
    LyZ verknüpft es mit dieser BibTeX-Datenbank, aber die Datei fehlt:
    { $bib }
    { "" }
    OK drücken, um die fehlende BibTeX-Datei aus LyZ-Einträgen neu zu erstellen.
    Abbrechen drücken, um eine andere BibTeX-Datenbank auszuwählen oder zu erstellen.

lyz-msg-bibtex-missing-title = LyZ BibTeX-Datenbank fehlt

lyz-msg-bibtex-exists =
    Aktives LyX-Dokument:
    { $doc }
    { "" }
    LyZ verknüpft es derzeit mit dieser BibTeX-Datenbank:
    { $bib }
    { "" }
    OK drücken, um diese BibTeX-Datenbank zu verwenden.
    Abbrechen drücken, um eine andere BibTeX-Datenbank auszuwählen oder zu erstellen.

lyz-msg-bibtex-exists-title = LyZ BibTeX-Datenbank

lyz-msg-record-changed =
    Zotero-Eintrag wurde geändert.
    OK drücken, um „BibTeX aktualisieren" auszuführen und das Zitat einzufügen.
    Abbrechen drücken, um keine Aktion auszuführen.

lyz-msg-record-changed-title = Zotero-Eintrag geändert!

## Dialog messages — BibTeX update

lyz-msg-confirm-update-bibtex =
    Die BibTeX-Datenbank wird aktualisiert:
    { "" }
    { $bib }
    { "" }
    Das aktuelle BibTeX-Schlüsselformat „{ $citekey }" wird verwendet.
    Möchten Sie fortfahren?

lyz-msg-no-valid-items =
    Für diese BibTeX-Datenbank wurden keine gültigen Zotero-Einträge gefunden.
    { "" }
    Die LyZ-Datenbank enthält möglicherweise veraltete Einträge aus einem älteren oder fehlerhaften BibTeX-Header.

lyz-msg-aborting = Abbruch

lyz-msg-confirm-update-lyx-docs =
    Ihre BibTeX-Datenbank { $bib } wurde aktualisiert.
    Möchten Sie auch die zugehörigen LyX-Dokumente aktualisieren?
    Dies ist nur erforderlich, wenn Autor, Titel oder Jahr geändert wurde,
    oder das BibTeX-Schlüsselformat geändert wurde.

lyz-msg-items-changed = { $count } Eintrag/Einträge geändert oder hinzugefügt.

## Dialog messages — database record management

lyz-msg-confirm-delete-bib =
    Sie sind dabei, den Eintrag der BibTeX-Datenbank zu löschen:
    { $bib }
    Einträge zugehöriger Dokumente werden ebenfalls gelöscht.

lyz-msg-confirm-delete-bib-title = LyZ-Datenbankeintrag löschen

lyz-msg-confirm-delete-doc =
    Möchten Sie den LyZ-Datenbankeintrag des Dokuments wirklich löschen?
    { $doc }

## Dialog messages — LyX command test

lyz-cmd-title = LyZ-Befehl

lyz-cmd-prompt = Befehl

lyz-cmd-default = server-get-filename

lyz-cmd-no-command = Kein LyX-Befehl eingegeben.

lyz-cmd-no-response = Keine Antwort vom LyX-Server.

lyz-cmd-response =
    LyX-Antwort auf { $command }:
    { "" }
    { $parsed }

lyz-cmd-empty-response =
    LyX hat auf { $command } geantwortet, aber einen leeren Wert zurückgegeben.
    { "" }
    Falls dies server-get-filename war, stellen Sie sicher, dass das LyX-Dokument gespeichert und aktiv ist.

lyz-cmd-raw-response =
    Rohe LyX-Antwort auf { $command }:
    { "" }
    { $response }

lyz-cmd-error =
    Fehler beim Verbinden mit dem lyxserver...
    { $error }
    Bitte erneut versuchen.

## Dialog messages — Zotero 5 migration

lyz-msg-migration-title = LyZ: Legacy-Datenbank erkannt

lyz-msg-migration-body =
    LyZ hat Zotero 4.0-Einträge in seiner Datenbank erkannt. Diese Einträge verhindern, dass LyZ eine .bib-Datei erstellt. Möchten Sie, dass LyZ versucht, die Einträge auf Zotero 5-Elemente zu aktualisieren? Erstellen Sie bitte vorher eine Sicherung Ihres Zotero-Datenverzeichnisses. Es ist über „Dateien und Ordner" im Bereich „Erweitert" der Zotero-Einstellungen zugänglich. Einige Zitierschlüssel können sich bei diesem Vorgang ändern.

lyz-msg-migration-checkbox = Diese Aufforderung in Zukunft nicht mehr anzeigen

lyz-msg-migration-reset =
    Um diesen Dialog in Zukunft wieder anzuzeigen, setzen Sie extensions.lyz.checkZotero5Migration im Konfigurations-Editor in den erweiterten Zotero-Einstellungen zurück.

lyz-msg-migration-start =
    Die LyZ-Datenbankmigration beginnt jetzt. Beenden Sie Zotero nicht, bis LyZ anzeigt, dass die Migration abgeschlossen ist.

lyz-msg-migration-complete = LyZ-Migration abgeschlossen. Es wurden keine Zitierschlüssel geändert.

## LyX Server error messages

lyz-server-title = LyZ-Server

lyz-server-no-contact = Kein Kontakt zum Server unter: { $path }

lyz-server-error =
    FEHLER: lyxGetDoc:
    { "" }
    { $response }

lyz-server-no-filename =
    LyX hat geantwortet, aber keinen aktiven Dateinamen zurückgegeben.
    { "" }
    Stellen Sie sicher, dass das LyX-Dokument gespeichert und das Dokumentfenster aktiv ist.

lyz-server-pipe-not-exist = Der angegebene LyXServer-Pipe existiert nicht.

lyz-server-wrong-path =
    Falscher Pfad zum LyX-Server:
    { $path }
    { $error }

lyz-server-wrong-path-hint =
    Falscher Pfad zum LyX-Server.
    Legen Sie den in den LyX-Einstellungen angegebenen Pfad fest.

lyz-server-command-failed = Fehler beim Ausführen von: { $command }

lyz-server-error-general =
    SERVERFEHLER:
    { $error }
