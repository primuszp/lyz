// Test-only bootstrap hook. Uses real Zotero items/export, SQLite, file APIs and LyXServer.
var lyzProductionStartup = startup;
var lyzProductionEnsure = LyZBootstrap.ensureLyzInitialized;
var lyzSmokeAlerts = [];
var lyzSmokeRejectRewrite = false;
LyZBootstrap.ensureLyzInitialized = async function() {
    var lyz = Zotero.Lyz;
    if (lyz) {
        var directory = Services.prefs.getStringPref("lyz.smoke.directory");
        lyz.confirm = (message, title) => message.includes(directory)
            && !(lyzSmokeRejectRewrite && title === LyZLocale.getString("lyz-msg-confirm-update-lyx-docs-title"));
        lyz.alert = (message, title) => lyzSmokeAlerts.push({ title, message });
        LyZServer.alert = (message, title) => lyzSmokeAlerts.push({ title, message });
    }
    return lyzProductionEnsure.call(this);
};
startup = async function(data, reason) {
    await lyzProductionStartup(data, reason);
    setTimeout(() => lyzInstalledLifecycle(), 0);
};

async function lyzInstalledLifecycle() {
    var directory = Services.prefs.getStringPref("lyz.smoke.directory");
    var report = { zotero: Zotero.version, platform: Services.appinfo.platformVersion,
        passed: false, checks: [], alerts: lyzSmokeAlerts };
    var assert = (condition, message) => {
        if (!condition) throw new Error(message);
        report.checks.push(message);
    };
    var path = name => PathUtils.join(directory, name);
    var master = path("Mester árvíztűrő.lyx").replace(/\\/g, "/");
    var child = path("Gyermek tükörfúrógép.lyx").replace(/\\/g, "/");
    var other = path("Másik dokumentum.lyx").replace(/\\/g, "/");
    var bib = path("közös könyvtár.bib");
    var otherBib = path("másik könyvtár.bib");
    var read = async file => new TextDecoder().decode(await LyZFiles.read(file));
    var fingerprint = async file => LyZKeyUpdate.fingerprint(await LyZFiles.read(file));
    var snapshot = async lyz => ({
        files: await Promise.all([bib, master, child, other, otherBib].map(fingerprint)),
        keys: JSON.stringify((await LyZDatabase.getKeysForBib(lyz, bib)).map(row => ({ key: row.key, zid: row.zid })))
    });
    try {
        await LyZBootstrap.ensureLyzInitialized();
        var lyz = Zotero.Lyz;
        assert(lyz.initialized && !lyz.databaseBlocked, "isolated Zotero database initializes");
        var command = value => LyZServer.requireCommand(lyz, value);
        var active = await command("server-get-filename");
        if (Services.prefs.getStringPref("lyz.smoke.phase") === "recover") {
            var interrupted = await IOUtils.readJSON(path("crash-ready.json"));
            report.checks = interrupted.checks;
            assert(![master, child].some(file => LyZKeyUpdate.normalizePath(file, lyz.os)
                === LyZKeyUpdate.normalizePath(active, lyz.os)), "affected LyX buffers were closed before startup recovery");
            assert(JSON.stringify(await snapshot(lyz)) === JSON.stringify(interrupted.before),
                "actual Zotero process termination and restart restore original file hashes and mappings");
            assert(!lyz.recoveryRequired && !(await LyZDatabase.listKeyUpdates(lyz)).length,
                "native restart recovery retires the prepared journal and unblocks changes");
            await command("file-open:" + master);
            assert(await LyZBootstrap.runCommand("updateBibtexAll"), "a recovered native transaction can be retried successfully");
            var retried = await LyZDatabase.getKeysForBib(lyz, bib);
            assert([await read(master), await read(child)].every(text => text.includes('key "' + retried[0].key + '"')),
                "retry commits consistent citations in both documents");
            report.passed = true;
            report.restartedAfterTermination = true;
            return;
        }
        assert(LyZKeyUpdate.normalizePath(active, lyz.os) === LyZKeyUpdate.normalizePath(master, lyz.os),
            "native Windows LyXServer reaches only the isolated Unicode fixture");
        await LyZDatabase.addDocument(lyz, master, bib);
        await LyZDatabase.addDocument(lyz, child, bib);
        await LyZDatabase.addDocument(lyz, other, otherBib);
        var untouched = [await fingerprint(other), await fingerprint(otherBib)];
        var item = new Zotero.Item("journalArticle");
        item.setField("title", "Isolated citation original title");
        item.setField("date", "2026");
        item.setCreators([{ firstName: "Test", lastName: "Original", creatorType: "author" }]);
        await item.saveTx();
        var zid = Zotero.Items.getLibraryKeyHash(item);
        var pane = Zotero.getMainWindow().ZoteroPane;
        await pane.selectItem(item.id);
        assert(pane.getSelectedItems().some(selected => selected.id === item.id), "real Zotero item is selected in the isolated library");
        await LyZBootstrap.runCommand("checkAndCite");
        await command("buffer-write:force");
        var initial = await LyZDatabase.getKeysForBib(lyz, bib);
        assert(initial.length === 1 && initial[0].zid === zid && (await read(bib)).includes("@article"),
            "production citation workflow exports a real BibTeX entry and commits its mapping");
        var oldKey = initial[0].key;
        assert((await read(master)).includes('key "' + oldKey + '"'), "native LyX citation insertion uses the exported key");
        await command("file-open:" + child);
        await LyZBootstrap.runCommand("checkAndCite");
        await command("buffer-write:force");
        assert((await read(child)).includes('key "' + oldKey + '"'), "both documents cite the shared bibliography");
        await command("self-insert:UNSAVED CHILD EDIT");
        await command("file-open:" + master);
        await command("self-insert:UNSAVED MASTER EDIT");
        item.setField("title", "Changed citation replacement title");
        item.setCreators([{ firstName: "Test", lastName: "Replacement", creatorType: "author" }]);
        await item.saveTx();
        assert(await LyZBootstrap.runCommand("updateBibtexAll"), "production multi-document key update completes through native LyX commands");
        var updated = await LyZDatabase.getKeysForBib(lyz, bib);
        var newKey = updated[0].key;
        report.keys = { oldKey, newKey };
        assert(newKey !== oldKey && (await read(bib)).includes("@article{" + newKey + ","),
            "changed item metadata produces a new exported key and committed mapping");
        for (var [file, marker] of [[master, "UNSAVED MASTER EDIT"], [child, "UNSAVED CHILD EDIT"]]) {
            var text = await read(file);
            assert(text.includes('key "' + newKey + '"') && !text.includes('key "' + oldKey + '"') && text.includes(marker),
                "key rewrite and unsaved edit are preserved: " + LyZFiles.filename(file));
        }
        assert((await fingerprint(other)) === untouched[0] && (await fingerprint(otherBib)) === untouched[1], "unrelated document and bibliography remain byte-identical");
        assert(LyZKeyUpdate.normalizePath(await command("server-get-filename"), lyz.os) === LyZKeyUpdate.normalizePath(master, lyz.os),
            "original active document is reopened last");
        var backups = (await IOUtils.getChildren(directory)).filter(file => file.endsWith(".lyz~"));
        assert(backups.length === 3, "unique native backups exist for bibliography and both documents");
        for (var file of [master, child]) {
            var backup = backups.find(candidate => LyZKeyUpdate.normalizePath(candidate, lyz.os).startsWith(LyZKeyUpdate.normalizePath(file + ".", lyz.os)));
            var text = await read(backup);
            assert(text.includes('key "' + oldKey + '"') && text.includes(file === master ? "UNSAVED MASTER EDIT" : "UNSAVED CHILD EDIT"),
                "backup preserves pre-rewrite citations and saved edits: " + LyZFiles.filename(file));
        }
        assert(!(await LyZDatabase.listKeyUpdates(lyz)).length, "successful update retires its native SQLite recovery journal");
        item.setCreators([{ firstName: "Test", lastName: "Canceled", creatorType: "author" }]);
        await item.saveTx();
        var before = await snapshot(lyz);
        lyzSmokeRejectRewrite = true;
        assert(!await LyZBootstrap.runCommand("updateBibtexAll"), "canceling rewrite aborts the production update");
        lyzSmokeRejectRewrite = false;
        assert(JSON.stringify(await snapshot(lyz)) === JSON.stringify(before), "cancel leaves files and mappings unchanged");
        assert(!lyzSmokeAlerts.length, "native workflow emits no failure alerts");
        await command("buffer-switch:" + child);
        await command("buffer-close");
        assert(await LyZBootstrap.runCommand("updateBibtexAll"), "an associated closed document is opened, rewritten and reopened");
        var closedKey = (await LyZDatabase.getKeysForBib(lyz, bib))[0].key;
        assert((await read(child)).includes('key "' + closedKey + '"'), "the initially closed child receives the committed key");
        item.setCreators([{ firstName: "Test", lastName: "CaughtFailure", creatorType: "author" }]);
        await item.saveTx();
        before = await snapshot(lyz);
        var nativeWrite = LyZFiles.write;
        var failed = false;
        LyZFiles.write = async function(file, bytes, options) {
            if (!failed && LyZKeyUpdate.normalizePath(file, lyz.os) === LyZKeyUpdate.normalizePath(master, lyz.os)) {
                failed = true;
                throw new Error("Injected fixture document write failure");
            }
            return nativeWrite.call(this, file, bytes, options);
        };
        try {
            assert(!await LyZBootstrap.runCommand("updateBibtexAll"), "a caught write failure aborts the installed update");
        } finally { LyZFiles.write = nativeWrite; }
        assert(failed && JSON.stringify(await snapshot(lyz)) === JSON.stringify(before),
            "native rollback restores already replaced files and retains original mappings");
        assert(!(await LyZDatabase.listKeyUpdates(lyz)).length, "verified native rollback retires its journal");
        assert(lyzSmokeAlerts.length === 1, "caught failure is reported once");
        lyzSmokeAlerts.length = 0;
        item.setCreators([{ firstName: "Test", lastName: "Interrupted", creatorType: "author" }]);
        await item.saveTx();
        before = await snapshot(lyz);
        LyZFiles.write = async function(file, bytes, options) {
            var written = await nativeWrite.call(this, file, bytes, options);
            if (LyZKeyUpdate.normalizePath(file, lyz.os) === LyZKeyUpdate.normalizePath(bib, lyz.os)) {
                var journal = await LyZDatabase.listKeyUpdates(lyz);
                assert(journal.length === 1 && journal[0].state === "prepared", "native crash checkpoint follows durable journal preparation and first file replacement");
                await IOUtils.writeUTF8(path("crash-ready.json"), JSON.stringify({ before, checks: report.checks }),
                    { tmpPath: path("crash-ready.tmp"), flush: true });
                // Runner terminates this exact Zotero process. No rollback/finally executes.
                return new Promise(() => {});
            }
            return written;
        };
        await LyZBootstrap.runCommand("updateBibtexAll");
        throw new Error("Runner did not terminate the isolated crash checkpoint");
    } catch (error) {
        report.error = String(error);
        report.stack = error.stack;
    } finally {
        try {
            await IOUtils.writeUTF8(path("result.json"), JSON.stringify(report, null, 2));
        } finally {
            Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
        }
    }
}
