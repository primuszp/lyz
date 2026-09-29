if (typeof Services === "undefined") {
    var { Services } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");
}

var LyZ_Preferences = {
    translators: [],
    saveStatusTimer: null,
    connectionRequest: 0,
    // Fixed sample item for the key preview, already normalized like LyZBibTeX.createCiteKey.
    citeKeySample: {
        citation: "Einstein, A. (1905). On the Electrodynamics of Moving Bodies",
        values: { author: "einstein", year: "1905", title: "ontheelectrodynamics", zotero: "1_X7K2M9QD", zoteroShort: "X7K2M9QD" }
    },

    async init() {
        LyZSettings.init();
        this.bindAutosave();
        this.bindConnectionActions();
        this.loadValues();
        this.setConnectionStatus({ state: "idle" });
        try {
            await this.loadTranslators();
        } catch (e) {
            Zotero.logError(e);
        }
        window.addEventListener("beforeunload", () => this.save(false));
    },

    loadValues() {
        const values = LyZSettings.getValues();
        const lyxServerInput = document.getElementById("lyz-lyxserver");
        const defaultLyxServer = LyZSettings.getDefaultLyXServerPath();
        lyxServerInput.placeholder = defaultLyxServer;
        lyxServerInput.value = values.lyxserver;
        document.getElementById("lyz-citekey").value = values.citekey;
        document.getElementById("lyz-journalabbrev").checked = values.useJournalAbbreviation;
        this.setCiteKeyMode();
    },

    getDefaultLyXServerPath() {
        return LyZSettings.getDefaultLyXServerPath();
    },

    setCiteKeyMode() {
        const mode = LyZSettings.getCiteKeyMode();

        const modeMenu = document.getElementById("lyz-citekey-mode");
        for (const item of document.getElementById("lyz-citekey-mode").querySelectorAll("menuitem")) {
            if (item.getAttribute("value") == mode) {
                modeMenu.selectedItem = item;
                break;
            }
        }
        this.onCiteKeyModeChanged(false);
    },

    async loadTranslators() {
        let translators = [];
        try {
            translators = await Zotero.Translators.getAllForType("export");
        } catch (e) {
            Zotero.logError(e);
        }
        const bibTranslators = translators.filter(translator => this.isBibTeXTranslator(translator));
        this.translators = bibTranslators.length ? bibTranslators : [];
        this.ensureDefaultBibTeXTranslator();

        const popup = document.getElementById("lyz-format-popup");
        while (popup.firstChild) {
            popup.firstChild.remove();
        }

        const selectedTranslator = LyZSettings.getCharPref("selectedTranslator", "");
        const formatMenu = document.getElementById("lyz-format-menu");
        let selectedIndex = -1;
        let defaultIndex = 0;

        for (let i = 0; i < this.translators.length; i++) {
            const translator = this.translators[i];
            const item = document.createXULElement("menuitem");
            item.setAttribute("label", translator.label);
            item.setAttribute("value", translator.translatorID);
            popup.appendChild(item);

            if (translator.translatorID == selectedTranslator) {
                selectedIndex = i;
            }
            if (translator.translatorID == "9cb70025-a888-4a29-a210-93ec52da40d4") {
                defaultIndex = i;
            }
        }

        formatMenu.selectedIndex = selectedIndex >= 0 ? selectedIndex : defaultIndex;
        const selectedItem = popup.children[formatMenu.selectedIndex];
        if (selectedItem) {
            formatMenu.selectedItem = selectedItem;
            formatMenu.setAttribute("label", selectedItem.getAttribute("label"));
            formatMenu.setAttribute("value", selectedItem.getAttribute("value"));
            if (!selectedTranslator) {
                LyZSettings.saveValues({ selectedTranslator: selectedItem.getAttribute("value") });
            }
        }
    },

    ensureDefaultBibTeXTranslator() {
        const bibTeXID = "9cb70025-a888-4a29-a210-93ec52da40d4";
        if (!this.translators.some(translator => translator.translatorID == bibTeXID)) {
            this.translators.unshift({
                label: "BibTeX",
                translatorID: bibTeXID,
                target: "bib"
            });
        }
    },

    isBibTeXTranslator(translator) {
        const target = (translator.target || "").toLowerCase();
        const fileName = (translator.fileName || "").toLowerCase();
        const label = (translator.label || "").toLowerCase();
        return target.includes("bib") || label.includes("bibtex") || label.includes("biblatex")
            || fileName.includes("bibtex") || fileName.includes("biblatex");
    },

    bindAutosave() {
        const saveButton = document.getElementById("lyz-save");
        saveButton.addEventListener("click", () => this.save(true));
        saveButton.addEventListener("command", () => this.save(true));
        for (const id of ["lyz-lyxserver", "lyz-citekey"]) {
            const input = document.getElementById(id);
            input.addEventListener("input", () => this.save(false));
            input.addEventListener("change", () => this.save(true));
            input.addEventListener("blur", () => this.save(false));
        }
        document.getElementById("lyz-citekey").addEventListener("input", () => this.updateCiteKeyPreview());
        document.getElementById("lyz-lyxserver").addEventListener("input", () => this.onServerPathChanged());
        for (const id of ["lyz-citekey-mode", "lyz-journalabbrev", "lyz-format-menu"]) {
            document.getElementById(id).addEventListener("command", () => this.save());
        }
        document.getElementById("lyz-citekey-mode").addEventListener("command", () => this.onCiteKeyModeChanged(false));
    },

    onCiteKeyModeChanged(save = true) {
        const mode = this.getCiteKeyMode();
        const citeKeyInput = document.getElementById("lyz-citekey");
        citeKeyInput.disabled = mode != "custom";
        if (mode == "custom" && !citeKeyInput.value) {
            citeKeyInput.value = "author year title";
        }
        this.updateCiteKeyPreview();
        if (save) {
            this.save();
        }
    },

    getCiteKeyMode() {
        const modeMenu = document.getElementById("lyz-citekey-mode");
        return modeMenu.selectedItem ? modeMenu.selectedItem.getAttribute("value") : "custom";
    },

    save(showStatus = true) {
        const formatMenu = document.getElementById("lyz-format-menu");
        const selectedTranslator = formatMenu.selectedItem
            ? formatMenu.selectedItem.getAttribute("value")
            : formatMenu.getAttribute("value")
            ? formatMenu.getAttribute("value")
            : LyZSettings.getCharPref("selectedTranslator", "9cb70025-a888-4a29-a210-93ec52da40d4");
        const citeKeyMode = this.getCiteKeyMode();
        const createCiteKey = citeKeyMode != "translator";
        const citeKey = LyZSettings.getCiteKeyForMode(citeKeyMode, document.getElementById("lyz-citekey").value);
        const lyxServer = document.getElementById("lyz-lyxserver").value || LyZSettings.getDefaultLyXServerPath();

        document.getElementById("lyz-lyxserver").value = lyxServer;
        document.getElementById("lyz-citekey").value = citeKeyMode == "custom" ? citeKey : document.getElementById("lyz-citekey").value;

        LyZSettings.saveValues({
            lyxserver: lyxServer,
            citekey: citeKey,
            createCiteKey,
            selectedTranslator,
            useJournalAbbreviation: document.getElementById("lyz-journalabbrev").checked
        });
        Services.console.logStringMessage("LyZ preferences saved: lyxserver=" + lyxServer + ", citekey=" + citeKey);
        if (showStatus) {
            this.showSaveStatus();
        }
    },

    showSaveStatus() {
        const status = document.getElementById("lyz-save-status");
        status.value = LyZLocale.getString("lyz-pref-settings-saved", { server: document.getElementById("lyz-lyxserver").value });
        status.hidden = false;
        if (this.saveStatusTimer) {
            clearTimeout(this.saveStatusTimer);
        }
        this.saveStatusTimer = setTimeout(() => {
            status.hidden = true;
        }, 1500);
    },

    bindConnectionActions() {
        document.getElementById("lyz-test-connection").addEventListener("command", () => this.testConnection());
        document.getElementById("lyz-reset-server").addEventListener("command", () => this.resetServerPath());
    },

    onServerPathChanged() {
        // Any earlier result belongs to a different path.
        this.connectionRequest++;
        this.setConnectionStatus({ state: "idle" });
    },

    resetServerPath() {
        document.getElementById("lyz-lyxserver").value = LyZSettings.getDefaultLyXServerPath();
        this.save(true);
        this.onServerPathChanged();
    },

    async testConnection() {
        this.save(false);
        const request = ++this.connectionRequest;
        const button = document.getElementById("lyz-test-connection");
        const path = LyZSettings.detectLyXServerPath(document.getElementById("lyz-lyxserver").value);
        button.disabled = true;
        this.setConnectionStatus({ state: "checking", path });
        let result;
        try {
            if (typeof Zotero === "undefined" || !Zotero.Lyz || !Zotero.Lyz.testConnection) {
                throw new Error(LyZLocale.getString("lyz-pref-connection-unavailable"));
            }
            result = await Zotero.Lyz.testConnection();
        } catch (e) {
            result = { state: "error", path, detail: e && e.message ? e.message : String(e) };
        }
        // The button stays disabled while probing, so only one probe is ever in flight.
        button.disabled = false;
        if (request !== this.connectionRequest) {
            return null;
        }
        this.setConnectionStatus(result);
        return result;
    },

    setConnectionStatus(result) {
        const state = result.state;
        const known = ["idle", "checking", "ok", "no-document", "missing-pipe", "no-response", "error"];
        const key = known.includes(state) ? state : "error";
        const args = { path: result.path || "", document: result.document || "", detail: result.detail || "" };
        document.getElementById("lyz-connection-status").setAttribute("data-state", key);
        document.getElementById("lyz-connection-title").textContent = LyZLocale.getString("lyz-pref-connection-" + key, args);
        document.getElementById("lyz-connection-detail").textContent = LyZLocale.getString("lyz-pref-connection-" + key + "-detail", args);
        document.getElementById("lyz-connection-path").textContent = result.path
            ? LyZLocale.getString("lyz-pref-connection-path", args)
            : "";
    },

    describeCiteKey(mode, pattern) {
        const values = this.citeKeySample.values;
        if (mode == "translator") {
            return { key: "", warning: "" };
        }
        if (mode != "custom") {
            return { key: values[mode], warning: "" };
        }
        const keywords = LyZBibTeX.citeKeyPatternKeywords;
        const tokens = String(pattern || "").split(" ").filter(Boolean);
        const miscased = tokens.find(token => !keywords.includes(token)
            && keywords.some(keyword => keyword.toLowerCase() == token.toLowerCase()));
        let warning = "";
        if (miscased) {
            const keyword = keywords.find(word => word.toLowerCase() == miscased.toLowerCase());
            warning = LyZLocale.getString("lyz-pref-citekey-warning-case", { token: miscased, keyword });
        } else if (!tokens.some(token => keywords.includes(token))) {
            warning = LyZLocale.getString("lyz-pref-citekey-warning-literal");
        }
        let key = LyZBibTeX.expandCiteKeyPattern(pattern || "author year title", values);
        if (key == "lyz") {
            key = LyZBibTeX.fallbackCiteKey(values.zotero);
        }
        return { key, warning };
    },

    updateCiteKeyPreview() {
        const mode = this.getCiteKeyMode();
        const preview = this.describeCiteKey(mode, document.getElementById("lyz-citekey").value);
        const value = document.getElementById("lyz-citekey-preview-value");
        document.getElementById("lyz-citekey-preview-label").textContent = LyZLocale.getString(
            mode == "translator" ? "lyz-pref-citekey-preview-translator" : "lyz-pref-citekey-preview");
        value.textContent = preview.key;
        value.hidden = !preview.key;
        document.getElementById("lyz-citekey-preview-sample").textContent = mode == "translator"
            ? ""
            : LyZLocale.getString("lyz-pref-citekey-preview-sample", { citation: this.citeKeySample.citation });
        const warning = document.getElementById("lyz-citekey-warning");
        warning.textContent = preview.warning;
        warning.hidden = !preview.warning;
        return preview;
    }
};

if (typeof Zotero_Preferences !== "undefined") {
    Zotero_Preferences.LyZ_Preferences = LyZ_Preferences;
}
