// Appended only to a generated test XPI by run-zotero-smoke.py.
var lyzProductionStartup = startup;
startup = async function(data, reason) {
    await lyzProductionStartup(data, reason);
    // Do not block Zotero's plugin startup while the smoke test waits for UI readiness.
    setTimeout(() => lyzRuntimeSmoke(), 0);
};

async function lyzRuntimeSmoke() {
    var directory = Services.prefs.getStringPref("lyz.smoke.directory");
    var checks = [];
    var report = { zotero: Zotero.version, platform: Services.appinfo.platformVersion,
        locale: Services.locale.requestedLocales, passed: false, checks };
    var assert = (condition, name) => {
        if (!condition) throw new Error(name);
        checks.push(name);
    };
    var waitFor = async predicate => {
        for (var i = 0; i < 200; i++) {
            if (predicate()) return;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error("Timed out waiting for manager initialization");
    };
    try {
        Services.console.logStringMessage("LyZ smoke: waiting for initialization");
        await Promise.race([LyZBootstrap.ensureLyzInitialized(), new Promise((_, reject) =>
            setTimeout(() => reject(new Error("LyZ initialization timed out; schema promise state: "
                + Zotero.Schema.schemaUpdatePromise.isPending?.())), 30000))]);
        var lyz = Zotero.Lyz;
        assert(lyz.initialized && !lyz.databaseBlocked, "actual Zotero SQLite schema initialization");
        var documentPath = PathUtils.join(directory, "Árvíztűrő dokumentum.lyx");
        var bib = PathUtils.join(directory, "könyvtár.bib");
        await IOUtils.writeUTF8(documentPath, "#LyX 2.4 created this file\n\\begin_document\n\\end_document\n");
        await IOUtils.writeUTF8(bib, "% Empty smoke-test bibliography\n");
        var documentBytes = await IOUtils.read(documentPath);
        var bibBytes = await IOUtils.read(bib);
        await lyz.DB.queryAsync("INSERT INTO docs (doc,bib) VALUES (?,?)", [documentPath, bib]);
        var inventory = await LyZBootstrap.runCommand("mappingInventory");
        assert(inventory.editable && inventory.docs.length === 1 && inventory.docs[0].file.state === "ok",
            "inventory through actual Zotero DBConnection and IOUtils");
        lyz.mappingManager();
        var window = lyz.mappingWindow;
        await waitFor(() => window.LyZMappingManager?.data && !window.LyZMappingManager.busy);
        var manager = window.LyZMappingManager;
        var doc = window.document;
        assert(doc.getElementById("rows").children.length === 1, "native XHTML dialog receives bootstrap API and renders inventory");
        assert(doc.title === "Dokumentumok és bibliográfiák hozzárendelései", "Hungarian Fluent title resolves in actual localization registry");
        assert(window.getComputedStyle(doc.querySelector("h1")).fontSize === "25px",
            "native dialog stylesheet loads through registered chrome resources");
        var registry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIChromeRegistry);
        assert(registry.convertChromeURL(Services.io.newURI("chrome://lyz-skin/content/overlay.css")).spec
            .includes("chrome/skin/default/lyz/overlay.css"), "toolbar stylesheet uses a supported content registration");
        report.title = doc.title;
        var original = window;
        lyz.mappingManager();
        assert(lyz.mappingWindow === original, "manager reuses its existing window");
        var relocated = PathUtils.join(directory, "Új dokumentum.lyx");
        await IOUtils.writeUTF8(relocated, new TextDecoder().decode(documentBytes));
        // Supply a fixture choice; the interactive native file picker remains a manual check.
        var chooseFile = manager.api.chooseFile;
        manager.api.chooseFile = async () => relocated;
        manager.selected = manager.data.docs[0];
        await manager.preview(true);
        assert(manager.plan && manager.plan.action === "relink-doc", "native relink preview verifies file hashes");
        doc.getElementById("acknowledge").checked = true;
        await manager.apply();
        assert(manager.data.docs[0].doc === relocated.replace(/\\/g, "/") && manager.data.archive.length === 1,
            "Unicode Windows relink commits canonical document path and preserves original mapping");
        manager.api.chooseFile = chooseFile;
        manager.selected = manager.data.docs[0];
        await manager.preview(false);
        assert(manager.plan && !doc.getElementById("preview").hidden && doc.getElementById("apply").disabled,
            "native preview requires acknowledgment");
        manager.clearPreview();
        assert((await lyz.DB.queryAsync("SELECT * FROM docs")).length === 1, "cancel preserves active mapping");
        manager.selected = manager.data.docs[0];
        await manager.preview(false);
        doc.getElementById("acknowledge").checked = true;
        await manager.apply();
        assert(manager.data.docs.length === 0 && manager.data.archive.length === 2,
            "native manager apply archives original row in actual SQLite transaction");
        assert(String(documentBytes) === String(await IOUtils.read(documentPath))
            && String(bibBytes) === String(await IOUtils.read(bib)), "physical LyX and BibTeX files remain unchanged");
        window.close();
        lyz.mappingManager();
        await waitFor(() => lyz.mappingWindow.LyZMappingManager?.data && !lyz.mappingWindow.LyZMappingManager.busy);
        assert(lyz.mappingWindow !== original, "manager opens again after close");
        lyz.mappingWindow.close();
        report.passed = true;
    } catch (error) {
        report.error = String(error);
        report.stack = error.stack;
        var opened = Zotero.Lyz?.mappingWindow;
        if (opened && !opened.closed) {
            report.dialog = { uri: opened.location.href, ready: opened.document.readyState,
                title: opened.document.title, body: opened.document.body?.textContent,
                controller: !!opened.LyZMappingManager, arguments: opened.arguments?.length,
                message: opened.document.getElementById("message")?.textContent };
        }
        report.consoleErrors = Services.console.getMessageArray().filter(message =>
            message.message?.includes("lyz") || message.message?.includes("mapping-manager"))
            .map(message => message.message).slice(-20);
    } finally {
        try {
            await IOUtils.writeUTF8(PathUtils.join(directory, "result.json"), JSON.stringify(report, null, 2));
        } finally {
            Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
        }
    }
}
