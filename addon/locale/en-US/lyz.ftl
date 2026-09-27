### LyZ — Zotero plugin for LyX integration
### Locale: English (en-US)

## Mapping manager

lyz-manager-label =
    .label = Manage mappings…
lyz-manager-title = Document and bibliography mappings
lyz-manager-description = Find linked files, inspect problems and preview mapping changes.
lyz-manager-refresh = Refresh
lyz-manager-export = Export diagnostics
lyz-manager-docs = Documents
lyz-manager-bibs = Bibliographies
lyz-manager-keys = Citation keys
lyz-manager-recovery = Interrupted updates
lyz-manager-archive = Preserved records
lyz-manager-search = Search paths, titles, item identifiers or citation keys
lyz-manager-problems = Problems only
lyz-manager-previous = Previous
lyz-manager-next = Next
lyz-manager-select = Select a document or bibliography to manage its mapping.
lyz-manager-select-record = Select { $path }
lyz-manager-relink = Choose new file…
lyz-manager-remove = Remove mapping…
lyz-manager-preview = Review change
lyz-manager-operation = Operation
lyz-manager-from = Current path
lyz-manager-to = New path
lyz-manager-acknowledge = I have reviewed the affected mappings.
lyz-manager-apply = Save mapping change
lyz-manager-cancel = Cancel
lyz-manager-footer = Changes affect LyZ mappings only. Files and citation keys are not rewritten. Original records are preserved.
lyz-manager-ready = Mappings are available for editing. Choose a row and review the change before saving.
lyz-manager-readonly = Inspection only: database problems, unreadable records or an interrupted update prevent changes. Export diagnostics for investigation.
lyz-manager-document = Document path
lyz-manager-bibliography = Bibliography path
lyz-manager-file-status = File status
lyz-manager-bib-status = Bibliography status
lyz-manager-documents = Documents
lyz-manager-citation-keys = Keys
lyz-manager-item = Zotero item
lyz-manager-zid = Item identifier
lyz-manager-key = Citation key
lyz-manager-status = Status
lyz-manager-identifier = Update identifier
lyz-manager-details = Details
lyz-manager-record-type = Record type
lyz-manager-original-path = Original path
lyz-manager-state-ok = Available
lyz-manager-state-missing = File missing
lyz-manager-state-invalid = Invalid path or file
lyz-manager-state-unreadable = Cannot read file
lyz-manager-state-item-missing = Zotero item unavailable
lyz-manager-state-prepared = Update interrupted
lyz-manager-state-committed = Update committed
lyz-manager-empty = No matching records.
lyz-manager-count = { $first }–{ $last } of { $total } records
lyz-manager-affected-count = Affected: { $documents } document mapping(s), { $keys } citation key mapping(s).
lyz-manager-relink-doc = Relink document
lyz-manager-relink-bib = Relink bibliography
lyz-manager-delete-doc = Remove document mapping
lyz-manager-delete-bib = Remove bibliography mappings
lyz-manager-removed = Mapping removed; file retained
lyz-manager-relink-warning = This changes the path stored by LyZ. Check the bibliography path inside LyX separately; this action does not edit the document. Original mappings are preserved.
lyz-manager-remove-warning = Only mappings are removed. Bibliography removal also removes its document associations and key mappings. Files remain untouched and original records are preserved.
lyz-manager-source-missing = The original file is missing or its old path cannot be resolved. Confirm that the selected file is the intended replacement.
lyz-manager-choose-file = Choose the relocated file
lyz-manager-saved = Mapping change saved. Original records are available under Preserved records.
lyz-manager-error-blocked = Mapping changes are blocked until database checks and interrupted-update recovery succeed.
lyz-manager-error-stale = Mappings or files changed since this preview. Refresh the list and create a new preview.
lyz-manager-error-selection = Select a document or bibliography mapping first.
lyz-manager-error-file = The file is unavailable or is not a valid LyX/BibTeX file: { $path }
lyz-manager-error-unchanged = The selected file already has this mapping.
lyz-manager-error-occupied = The selected path is already mapped. Automatic merging is not supported: { $path }
lyz-manager-error-mismatch = The replacement does not match the original file or the bibliography item/key mappings. Choose the corresponding relocated file.

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

## Database diagnostics

lyz-diagnostics-label =
    .label = Export database diagnostics…

lyz-msg-database-title = LyZ database check

lyz-msg-database-blocked =
    LyZ could not safely open or migrate its mapping database:
    { $error }
    Data changes are blocked. Settings, LyX commands and Export database diagnostics remain available.
    Export a report from the LyZ menu for troubleshooting. Keep the original database and backups; do not edit lyz.sqlite manually.

lyz-msg-diagnostics-title = Export LyZ database diagnostics

lyz-msg-diagnostics-saved =
    Report saved to: { $path }
    It contains local file paths, Zotero item identifiers, citation keys and recovery records. Review it before sharing.
    Document and bibliography contents are not included. This report is not a restorable SQLite backup.

lyz-msg-diagnostics-failed = Could not save the diagnostic report: { $error }

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

lyz-select-record-prompt = Select a record.

lyz-select-no-records = There are no records to select.

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

lyz-msg-confirm-update-bibtex-title = Update BibTeX database

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
    Citation keys in { $bib } will change.
    Save, close, update and reopen all associated LyX documents?
    Verified backups will be kept beside the files.
    Cancel aborts the entire update without changing the bibliography or mappings.

lyz-msg-confirm-update-lyx-docs-title = Update LyX documents

lyz-msg-key-update-title = LyZ citation key update

lyz-msg-recovery-title = LyZ interrupted update recovery

lyz-msg-recovery-confirm =
    An interrupted update needs to restore these files to their previous state:
    { $files }
    Close all affected documents in every LyX window before continuing.
    Press OK to restore verified backups. Cancel keeps LyZ data changes blocked until recovery is completed.

lyz-msg-recovery-complete =
    The previous file state was restored and the original mappings were preserved:
    { $files }
    Verified backup files have been retained. You can reopen the documents in LyX.

lyz-msg-recovery-blocked =
    Recovery could not safely complete for: { $path }
    { $error }
    LyZ data changes are blocked. External edits will not be overwritten.
    Retained backups or journal identifier:
    { $backups }

lyz-msg-key-update-journal-retained = The update completed, but its recovery record could not be cleared. LyZ will verify the completed files and mappings before the next data change or at startup.

lyz-msg-key-update-missing-item = Zotero item { $zid } is unavailable. The update was aborted to preserve existing citations.

lyz-msg-key-update-rolled-back = No new mappings were committed. Any file changes made by this update were restored.

lyz-msg-key-update-failed =
    Update failed for: { $path }
    { $error }
    { $recovery }
    Retained backup files:
    { $backups }

lyz-msg-key-update-reopen-failed =
    The files and mappings were updated successfully, but LyX could not reopen these documents. Open them manually:
    { $error }

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

lyz-msg-confirm-delete-doc-title = Deleting LyZ document record

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

lyz-server-pipe-not-exist = The specified LyXServer pipe does not exist: { $path }

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
