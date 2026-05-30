if (typeof Services === "undefined") {
    var { Services } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");
}

var LyZSettings = {
    prefPrefix: "extensions.lyz.",
    prefs: null,

    init() {
        if (!this.prefs) {
            this.prefs = Services.prefs.getBranch("");
        }
    },

    getDefaultLyXServerPath() {
        return Zotero.isWin ? "\\\\.\\pipe\\lyxpipe" : "~/.lyx/lyxpipe";
    },

    getCharPref(name, fallback) {
        this.init();
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
        this.init();
        if (this.prefs.setStringPref) {
            this.prefs.setStringPref(this.prefPrefix + name, value);
        } else {
            this.prefs.setCharPref(this.prefPrefix + name, value);
        }
    },

    getBoolPref(name, fallback) {
        this.init();
        try {
            return this.prefs.getBoolPref(this.prefPrefix + name);
        } catch (e) {
            return fallback;
        }
    },

    setBoolPref(name, value) {
        this.init();
        this.prefs.setBoolPref(this.prefPrefix + name, value);
    },

    getValues() {
        const defaultLyxServer = this.getDefaultLyXServerPath();
        return {
            lyxserver: this.getCharPref("lyxserver", defaultLyxServer) || defaultLyxServer,
            citekey: this.getCharPref("citekey", "author year title") || "author year title",
            createCiteKey: this.getBoolPref("createCiteKey", true),
            selectedTranslator: this.getCharPref("selectedTranslator", "9cb70025-a888-4a29-a210-93ec52da40d4"),
            useJournalAbbreviation: this.getBoolPref("useJournalAbbreviation", false)
        };
    },

    saveValues(values, flush = true) {
        const current = this.getValues();
        const next = Object.assign({}, current, values);
        this.setCharPref("lyxserver", next.lyxserver || this.getDefaultLyXServerPath());
        this.setCharPref("citekey", next.citekey || "author year title");
        this.setBoolPref("createCiteKey", !!next.createCiteKey);
        this.setCharPref("selectedTranslator", next.selectedTranslator || "9cb70025-a888-4a29-a210-93ec52da40d4");
        this.setBoolPref("useJournalAbbreviation", !!next.useJournalAbbreviation);
        if (flush) {
            Services.prefs.savePrefFile(null);
        }
    },

    getCiteKeyMode(values = this.getValues()) {
        if (!values.createCiteKey) {
            return "translator";
        }
        if (values.citekey == "zotero" || values.citekey == "zoteroShort") {
            return values.citekey;
        }
        return "custom";
    },

    getCiteKeyForMode(mode, customPattern) {
        if (mode == "custom") {
            return customPattern || "author year title";
        }
        return mode;
    }
};
