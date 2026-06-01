### LyZ — Zotero plugin for LyX integration
### Locale: English (en-US)

## Menu labels

lyz-menu-label =
    .label = LyZ

lyz-toolbar-button =
    .tooltiptext = LyZ

lyz-cite-label =
    .label = Cite in LyX
    .tooltiptext = Send citation to LyX

lyz-update-bibtex-label =
    .label = Update BibTeX
    .tooltiptext = Update modified items in BibTeX file

lyz-delete-bib-label =
    .label = Delete BibTeX record…

lyz-delete-doc-label =
    .label = Delete LyX document record…

lyz-rename-bib-label =
    .label = Rename BibTeX record…

lyz-rename-doc-label =
    .label = Rename LyX document record…

lyz-settings-label =
    .label = Settings…

lyz-test-label =
    .label = LyX command…

## Preferences panel

lyz-pref-lyxserver-group =
    .aria-label = LyX Server

lyz-pref-lyxserver-heading = LyX Server

lyz-pref-pipe-path =
    .value = Pipe path

lyz-pref-save-settings =
    .label = Save Settings

lyz-pref-server-description = Windows default: \\.\pipe\lyxpipe. Linux/macOS examples usually end in lyxpipe.

lyz-pref-citation-keys-group =
    .aria-label = Citation Keys

lyz-pref-citation-keys-heading = Citation Keys

lyz-pref-key-source =
    .value = Key source

lyz-pref-citekey-mode-custom =
    .label = Custom pattern

lyz-pref-citekey-mode-zotero =
    .label = Zotero library/key

lyz-pref-citekey-mode-zotero-short =
    .label = Zotero item key only

lyz-pref-citekey-mode-translator =
    .label = Translator generated

lyz-pref-custom-pattern =
    .value = Custom pattern

lyz-pref-custom-pattern-desc = Use keywords separated by spaces: author year title zotero zoteroShort. Example: author _ title _ year.

lyz-pref-bibtex-export-group =
    .aria-label = BibTeX Export

lyz-pref-bibtex-export-heading = BibTeX Export

lyz-pref-export-translator =
    .value = Export translator

lyz-pref-journal-abbrev =
    .label = Use journal abbreviations

lyz-pref-bibtex-translators-desc = The default Zotero installation normally provides BibTeX. Additional BibTeX-compatible exporters appear here if installed.

lyz-pref-settings-saved = Settings saved: { $server }

## Dialog messages — LyX document / BibTeX selection

lyz-msg-select-citation = Please select at least one citation.

lyz-msg-no-bibtex-for-doc =
    There is no BibTeX database associated with the active LyX document:
    { $doc }

lyz-msg-could-not-retrieve-doc = Could not retrieve document name.

lyz-msg-file-not-exist = The specified { $doc } does not exist.

lyz-msg-report-error =
    Please report the following error:
    { $error }

lyz-msg-updating-doc = Updating { $doc }

lyz-msg-backup-failed = Backup failed.

lyz-msg-file-path-not-exist = File { $path } does not exist.

lyz-msg-select-bibtex-new =
    Press OK to create new BibTeX database.
    Press Cancel to select from your existing databases.

lyz-msg-select-bibtex-new-title = LyZ BibTeX Database

lyz-msg-select-bibtex-file = Select BibTeX file for { $doc }

lyz-msg-bibtex-filter = BibTeX

lyz-msg-select-lyx-doc = Select LyX document for { $doc }

lyz-msg-lyx-filter = LyX

lyz-msg-bibtex-missing =
    Active LyX document:
    { $doc }
    { "" }
    LyZ links it to this BibTeX database, but the file is missing:
    { $bib }
    { "" }
    Press OK to recreate the missing BibTeX file from LyZ records.
    Press Cancel to choose or create a different BibTeX database for this document.

lyz-msg-bibtex-missing-title = LyZ BibTeX database missing

lyz-msg-bibtex-exists =
    Active LyX document:
    { $doc }
    { "" }
    LyZ currently links it to this BibTeX database:
    { $bib }
    { "" }
    Press OK to use this BibTeX database.
    Press Cancel to choose or create a different BibTeX database for this document.

lyz-msg-bibtex-exists-title = LyZ BibTeX database

lyz-msg-record-changed =
    Zotero record has been changed.
    Press OK to run 'Update BibTeX' and insert the citation.
    Press Cancel to refrain from any action.

lyz-msg-record-changed-title = Zotero record changed!

## Dialog messages — BibTeX update

lyz-msg-confirm-update-bibtex =
    You are going to update BibTeX database:
    { "" }
    { $bib }
    { "" }
    Current BibTeX key format "{ $citekey }" will be used.
    Do you want to continue?

lyz-msg-no-valid-items =
    No valid Zotero item records were found for this BibTeX database.
    { "" }
    The LyZ database may contain stale records from an older or malformed BibTeX header.

lyz-msg-aborting = Aborting

lyz-msg-confirm-update-lyx-docs =
    Your BibTeX database { $bib } has been updated.
    Do you also want to update the associated LyX documents?
    This is only necessary when any author, title or year has been modified,
    or when the BibTeX key format has been changed.

lyz-msg-items-changed = { $count } item(s) changed or added.

## Dialog messages — database record management

lyz-msg-confirm-delete-bib =
    You are about to delete record of BibTeX database:
    { $bib }
    Record about associated documents will also be deleted.

lyz-msg-confirm-delete-bib-title = Deleting LyZ database record

lyz-msg-confirm-delete-doc =
    Do you really want to delete the LyZ database record of the document
    { $doc }?

## Dialog messages — LyX command test

lyz-cmd-title = LyZ Command

lyz-cmd-prompt = Command

lyz-cmd-default = server-get-filename

lyz-cmd-no-command = No LyX command entered.

lyz-cmd-no-response = No response from LyX server.

lyz-cmd-response =
    LyX response for { $command }:
    { "" }
    { $parsed }

lyz-cmd-empty-response =
    LyX responded to { $command }, but returned an empty value.
    { "" }
    If this was server-get-filename, make sure the LyX document is saved to disk and active.

lyz-cmd-raw-response =
    Raw LyX response for { $command }:
    { "" }
    { $response }

lyz-cmd-error =
    Error connecting to lyxserver...
    { $error }
    Try again.

## Dialog messages — Zotero 5 migration

lyz-msg-migration-title = LyZ: legacy database detected

lyz-msg-migration-body =
    LyZ has detected Zotero 4.0 entries in its database. These entries will prevent LyZ from creating a .bib file. Do you want LyZ to try to update the entries to match Zotero 5 items? Consider backing up your Zotero data directory before doing so. It can be accessed from the "Files and Folders" in the Advanced section of Zotero's preferences. Some cite keys may change during this process.

lyz-msg-migration-checkbox = Do not show this prompt in the future

lyz-msg-migration-reset =
    To show this dialog again in the future, reset extensions.lyz.checkZotero5Migration in the config editor available in Zotero's Advanced preferences section.

lyz-msg-migration-start =
    LyZ database migration will begin now. Do not exit Zotero until LyZ indicates that the migration is complete.

lyz-msg-migration-complete = LyZ migration complete. No citation keys were changed.

## LyX Server error messages

lyz-server-title = LyZ Server

lyz-server-no-contact = Could not contact server at: { $path }

lyz-server-error =
    ERROR: lyxGetDoc:
    { "" }
    { $response }

lyz-server-no-filename =
    LyX responded, but did not return an active filename.
    { "" }
    Make sure the LyX document is saved and the document window is active.

lyz-server-pipe-not-exist = The specified LyXServer pipe does not exist.

lyz-server-wrong-path =
    Wrong path to LyX server:
    { $path }
    { $error }

lyz-server-wrong-path-hint =
    Wrong path to LyX server.
    Set the path specified in LyX preferences.

lyz-server-command-failed = Failed to: { $command }

lyz-server-error-general =
    SERVER ERROR:
    { $error }
