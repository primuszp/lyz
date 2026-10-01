// Test-only bootstrap hook. Drives the real preferences pane against an isolated LyX process.
var lyzProductionStartup = startup;
var lyzSmokeAlerts = [];
startup = async function(data, reason) {
    await lyzProductionStartup(data, reason);
    setTimeout(() => lyzPreferencesSmoke(), 0);
};

async function lyzPreferencesSmoke() {
    var directory = Services.prefs.getStringPref("lyz.smoke.directory");
    var pipe = Services.prefs.getStringPref("extensions.lyz.lyxserver");
    var report = { zotero: Zotero.version, platform: Services.appinfo.platformVersion,
        passed: false, checks: [], alerts: lyzSmokeAlerts, snapshots: [], snapshotErrors: [] };
    var assert = (condition, message) => {
        if (!condition) throw new Error(message);
        report.checks.push(message);
    };
    var waitFor = async (predicate, message) => {
        for (var i = 0; i < 300; i++) {
            try {
                if (predicate()) return;
            } catch (e) {
                // The pane may still be loading.
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error("Timed out: " + message);
    };
    var snapshot = async (win, name, element = win.document.getElementById("lyz-prefpane")) => {
        try {
            await new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
            var box = element.getBoundingClientRect();
            var bitmap = await win.browsingContext.currentWindowGlobal.drawSnapshot(
                new win.DOMRect(box.x, box.y, box.width, Math.min(box.height, 1400)), 1, "white");
            var canvas = win.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            canvas.getContext("2d").drawImage(bitmap, 0, 0);
            var blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
            var file = PathUtils.join(directory, "prefs-" + name + ".png");
            await IOUtils.write(file, new Uint8Array(await blob.arrayBuffer()));
            report.snapshots.push(file);
        } catch (e) {
            report.snapshotErrors.push(name + ": " + e);
        }
    };
    // Counts pixels in an element that differ from its top-left pixel, i.e. whether anything is painted.
    var paintedPixels = async (win, element) => {
        var box = element.getBoundingClientRect();
        var bitmap = await win.browsingContext.currentWindowGlobal.drawSnapshot(
            new win.DOMRect(box.x, box.y, box.width, box.height), 1, "white");
        var canvas = win.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        var context = canvas.getContext("2d");
        context.drawImage(bitmap, 0, 0);
        var data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        var count = 0;
        for (var i = 4; i < data.length; i += 4) {
            if (Math.abs(data[i] - data[0]) + Math.abs(data[i + 1] - data[1]) + Math.abs(data[i + 2] - data[2]) > 60) count++;
        }
        return count;
    };
    var prefsWindow = null;
    try {
        await LyZBootstrap.ensureLyzInitialized();
        LyZServer.alert = (message, title) => lyzSmokeAlerts.push({ title, message });
        assert(Zotero.Lyz.initialized, "isolated Zotero database initializes");
        report.dark = Services.prefs.getIntPref("ui.systemUsesDarkTheme", 0) === 1;

        // Graphics follow Zotero: 20px toolbar icon, 16px menu icons, context-fill tinting.
        var main = Zotero.getMainWindow();
        await waitFor(() => main.document.getElementById("lyz-menu-button"), "LyZ toolbar button");
        var button = main.document.getElementById("lyz-menu-button");
        var buttonStyle = main.getComputedStyle(button);
        var reference = main.getComputedStyle(main.document.getElementById("zotero-tb-add"));
        assert(buttonStyle.listStyleImage.includes("chrome://lyz-skin/content/lyz-20.svg"), "toolbar button uses the 20px LyZ icon");
        assert(buttonStyle.fill === reference.fill && buttonStyle.MozContextProperties === reference.MozContextProperties,
            "toolbar icon is tinted exactly like Zotero's New Item button");
        var icon = button.querySelector(".toolbarbutton-icon");
        var referenceIcon = main.document.getElementById("zotero-tb-add").querySelector(".toolbarbutton-icon");
        assert(icon.getBoundingClientRect().width === referenceIcon.getBoundingClientRect().width,
            "toolbar icon has the same rendered size as Zotero's toolbar icons");
        // Popup content is only styled while the popup is open.
        var popup = main.document.getElementById("lyz-menupopup");
        var shown = new Promise(resolve => popup.addEventListener("popupshown", resolve, { once: true }));
        popup.openPopup(button, "after_start");
        await Promise.race([shown, new Promise(resolve => setTimeout(resolve, 3000))]);
        var menuIcons = Array.from(main.document.querySelectorAll("#lyz-menupopup > menuitem"))
            .map(item => main.getComputedStyle(item).listStyleImage.replace(/^url\("|"\)$/g, ""));
        report.menuIcons = menuIcons;
        assert(menuIcons.length === 6 && menuIcons.every(url => url.startsWith("chrome://")), "every toolbar menu item has a 16px icon");
        var iconBox = popup.querySelector("#lyz-send .menu-iconic-icon, #lyz-send .menu-icon");
        report.menuIconSize = iconBox ? iconBox.getBoundingClientRect().width : null;
        popup.hidePopup();
        var urls = new Set(menuIcons.concat(["chrome://lyz-skin/content/lyz-16.svg", "chrome://lyz-skin/content/lyz-20.svg",
            "chrome://lyz-skin/content/lyz-icon.svg"].concat(["info", "sync", "tick", "cross"]
            .map(name => "chrome://zotero/skin/16/universal/" + name + ".svg"))));
        var missing = [];
        for (var url of urls) {
            try {
                var text = await (await main.fetch(url)).text();
                if (!text.includes("<svg")) missing.push(url);
            } catch (e) {
                missing.push(url);
            }
        }
        assert(!missing.length, "all referenced LyZ and Zotero icons resolve: " + (missing.join(", ") || urls.size + " files"));
        await snapshot(main, "0-toolbar", main.document.getElementById("zotero-items-toolbar"));

        Zotero.Utilities.Internal.openPreferences("lyz-prefpane");
        await waitFor(() => {
            prefsWindow = Services.wm.getMostRecentWindow("zotero:pref");
            return prefsWindow.document.getElementById("lyz-connection-title").textContent;
        }, "LyZ preferences pane");
        var win = prefsWindow;
        var doc = win.document;
        var status = doc.getElementById("lyz-connection-status");
        var text = id => doc.getElementById(id).textContent;
        var click = async id => {
            doc.getElementById(id).click();
            await waitFor(() => status.getAttribute("data-state") != "checking"
                && !doc.getElementById("lyz-test-connection").disabled, id + " result");
        };

        // PreferencePanes attaches pane stylesheets after the pane markup is inserted.
        await waitFor(() => win.getComputedStyle(status).borderInlineStartWidth === "3px", "pane stylesheet");
        assert(true, "pane stylesheet is registered through PreferencePanes");
        assert(text("lyz-connection-title") === "A kapcsolat még nincs tesztelve",
            "pane opens with a localized untested connection state");
        await waitFor(() => doc.querySelector("#lyz-test-connection").label, "button localization");
        assert(doc.getElementById("lyz-test-connection").label === "Kapcsolat tesztelése",
            "Test connection button is localized through Fluent");
        assert(text("lyz-citekey-preview-value") === "einstein1905ontheelectrodynamics",
            "citation key preview uses the shipped key generator");
        var navImage = doc.querySelector("#prefs-navigation richlistitem[value='lyz-prefpane'] image, #prefs-navigation [value='lyz-prefpane'] image");
        assert(navImage && navImage.src === "chrome://lyz-skin/content/lyz-20.svg", "settings sidebar uses the 20px LyZ icon like built-in panes");
        var navItem = navImage.closest("richlistitem");
        report.sidebarLabel = (navItem.textContent + Array.from(navItem.querySelectorAll("label"))
            .map(label => label.getAttribute("value") || "").join("")).trim();
        assert(report.sidebarLabel === "LyZ", "settings sidebar entry is labelled with the plugin name");
        await snapshot(win, "1-idle");
        await snapshot(win, "0-sidebar", doc.getElementById("prefs-navigation"));

        await click("lyz-test-connection");
        assert(status.getAttribute("data-state") === "ok" && text("lyz-connection-detail").includes("Mester árvíztűrő.lyx"),
            "native button click reaches isolated LyX and names the active Unicode document");
        assert(win.getComputedStyle(doc.querySelector(".lyz-status-icon")).listStyleImage.includes("16/universal/tick.svg"),
            "connected state uses Zotero's tick icon");
        var statusIcon = doc.querySelector(".lyz-status-icon");
        await new Promise(resolve => setTimeout(resolve, 300));
        report.statusIconPixels = await paintedPixels(win, statusIcon);
        assert(report.statusIconPixels > 10, "status icon is actually painted");
        await snapshot(win, "2-connected");

        var input = doc.getElementById("lyz-lyxserver");
        input.value = "\\\\.\\pipe\\lyz-missing-" + Services.uuid.generateUUID().toString().slice(1, 9);
        input.dispatchEvent(new win.Event("input"));
        assert(status.getAttribute("data-state") === "idle", "editing the path clears the previous result");
        await click("lyz-test-connection");
        assert(status.getAttribute("data-state") === "missing-pipe" && text("lyz-connection-path").includes(input.value),
            "missing Windows pipe is reported inline with the tested path");
        await snapshot(win, "3-missing-pipe");

        var citekey = doc.getElementById("lyz-citekey");
        citekey.value = "Author year";
        citekey.dispatchEvent(new win.Event("input"));
        assert(!doc.getElementById("lyz-citekey-warning").hidden && text("lyz-citekey-warning").includes("„Author”"),
            "case-mismatched keyword warning is visible while typing");
        await snapshot(win, "4-citekey-warning");

        input.value = pipe;
        input.dispatchEvent(new win.Event("input"));
        citekey.value = "author year title";
        citekey.dispatchEvent(new win.Event("input"));
        assert(Services.prefs.getStringPref("extensions.lyz.lyxserver") === pipe
            && Services.prefs.getStringPref("extensions.lyz.citekey") === "author year title", "edits autosave to preferences");
        assert(lyzSmokeAlerts.length === 0, "connection tests never open modal alerts");
        report.passed = true;
    } catch (error) {
        report.error = String(error);
        report.stack = error.stack;
        if (prefsWindow) {
            report.pane = prefsWindow.document.getElementById("lyz-prefpane")?.textContent?.replace(/\s+/g, " ");
        }
        report.consoleErrors = Services.console.getMessageArray().map(message => message.message)
            .filter(message => /lyz|preferences/i.test(message || "")).slice(-20);
    } finally {
        try {
            await IOUtils.writeUTF8(PathUtils.join(directory, "result.json"), JSON.stringify(report, null, 2));
        } finally {
            Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
        }
    }
}
