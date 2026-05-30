if (typeof Services === "undefined") {
    var { Services } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");
}

var LyZ_Preferences = {
    translators: [],
    prefs: null,
    prefPrefix: "extensions.lyz.",
    saveStatusTimer: null,

    async init() {
        this.prefs = Services.prefs.getBranch("");
        this.bindAutosave();
        this.loadValues();
        try {
            await this.loadTranslators();
        } catch (e) {
            Zotero.logError(e);
        }
        window.addEventListener("beforeunload", () => this.save(false));
    },

    loadValues() {
        const lyxServerInput = document.getElementById("lyz-lyxserver");
        const defaultLyxServer = this.getDefaultLyXServerPath();
        lyxServerInput.placeholder = defaultLyxServer;
        lyxServerInput.value = this.getCharPref("lyxserver", defaultLyxServer) || defaultLyxServer;
        document.getElementById("lyz-citekey").value = this.getCharPref("citekey", "author year title");
        document.getElementById("lyz-journalabbrev").checked = this.getBoolPref("useJournalAbbreviation", false);
        this.setCiteKeyMode();
    },

    getDefaultLyXServerPath() {
        return Zotero.isWin ? "\\\\.\\pipe\\lyxpipe" : "~/.lyx/lyxpipe";
    },

    getCharPref(name, fallback) {
        try {
            if (this.prefs.getStringPref) {
                return this.prefs.getStringPref(this.prefPrefix + name);
            }
            return this.prefs.getCharPref(this.prefPrefix + name);
        } catch (e) {
            return fallback;
        }
    },

    setCharPref(name, value) {
        if (this.prefs.setStringPref) {
            this.prefs.setStringPref(this.prefPrefix + name, value);
        } else {
            this.prefs.setCharPref(this.prefPrefix + name, value);
        }
    },

    getBoolPref(name, fallback) {
        try {
            return this.prefs.getBoolPref(this.prefPrefix + name);
        } catch (e) {
            return fallback;
        }
    },

    setBoolPref(name, value) {
        this.prefs.setBoolPref(this.prefPrefix + name, value);
    },

    setCiteKeyMode() {
        const createCiteKey = this.getBoolPref("createCiteKey", true);
        const citeKey = this.getCharPref("citekey", "author year title");
        let mode = "custom";
        if (!createCiteKey) {
            mode = "translator";
        } else if (citeKey == "zotero" || citeKey == "zoteroShort") {
            mode = citeKey;
        }

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

        const selectedTranslator = this.getCharPref("selectedTranslator", "");
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
                this.setCharPref("selectedTranslator", selectedItem.getAttribute("value"));
                Services.prefs.savePrefFile(null);
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
            : this.getCharPref("selectedTranslator", "9cb70025-a888-4a29-a210-93ec52da40d4");
        const citeKeyMode = this.getCiteKeyMode();
        const createCiteKey = citeKeyMode != "translator";
        const citeKey = citeKeyMode == "custom"
            ? document.getElementById("lyz-citekey").value || "author year title"
            : citeKeyMode;
        const lyxServer = document.getElementById("lyz-lyxserver").value || this.getDefaultLyXServerPath();

        document.getElementById("lyz-lyxserver").value = lyxServer;
        document.getElementById("lyz-citekey").value = citeKeyMode == "custom" ? citeKey : document.getElementById("lyz-citekey").value;

        this.setCharPref("lyxserver", lyxServer);
        this.setCharPref("citekey", citeKey);
        this.setBoolPref("createCiteKey", createCiteKey);
        this.setCharPref("selectedTranslator", selectedTranslator);
        this.setBoolPref("useJournalAbbreviation", document.getElementById("lyz-journalabbrev").checked);
        Services.prefs.savePrefFile(null);
        Services.console.logStringMessage("LyZ preferences saved: lyxserver=" + lyxServer + ", citekey=" + citeKey);
        if (showStatus) {
            this.showSaveStatus();
        }
    },

    showSaveStatus() {
        const status = document.getElementById("lyz-save-status");
        status.value = "Settings saved: " + document.getElementById("lyz-lyxserver").value;
        status.hidden = false;
        if (this.saveStatusTimer) {
            clearTimeout(this.saveStatusTimer);
        }
        this.saveStatusTimer = setTimeout(() => {
            status.hidden = true;
        }, 1500);
    }
};

if (typeof Zotero_Preferences !== "undefined") {
    Zotero_Preferences.LyZ_Preferences = LyZ_Preferences;
}
