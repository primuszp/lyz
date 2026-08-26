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

    resolvePath(path) {
        if (Zotero.isWin || typeof path !== "string" || !path.startsWith("~/")) {
            return path;
        }
        const home = Services.dirsvc.get("Home", Components.interfaces.nsIFile).path;
        return home.replace(/[\\\\/]$/, "") + path.slice(1);
    },

    pipeExists(path) {
        if (!path || Zotero.isWin) {
            return false;
        }
        try {
            const input = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);
            const output = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);
            input.initWithPath(path + ".in");
            output.initWithPath(path + ".out");
            return input.exists() && output.exists();
        } catch (e) {
            return false;
        }
    },

    getMacLyXServerCandidates() {
        if (Zotero.isWin) {
            return [];
        }
        const home = Services.dirsvc.get("Home", Components.interfaces.nsIFile).path.replace(/[\\\\/]$/, "");
        const base = home + "/Library/Application Support";
        const candidates = [];
        // LyX stores user data in versioned LyX-X.Y directories on macOS.
        // Generate newest-first candidates instead of relying on XPCOM directory enumeration.
        for (let major = 9; major >= 1; major--) {
            for (let minor = 20; minor >= 0; minor--) {
                candidates.push(base + "/LyX-" + major + "." + minor + "/.lyxpipe");
            }
        }
        candidates.push(base + "/LyX/.lyxpipe");
        return candidates;
    },

    getLinuxLyXServerCandidates() {
        if (Zotero.isWin) {
            return [];
        }
        const home = Services.dirsvc.get("Home", Components.interfaces.nsIFile).path.replace(/[\\\\/]$/, "");
        const candidates = [];
        try {
            const xdgConfigHome = Services.env.get("XDG_CONFIG_HOME");
            if (xdgConfigHome) {
                candidates.push(xdgConfigHome.replace(/[\\\\/]$/, "") + "/lyx/lyxpipe");
            }
        } catch (e) {
            // XDG_CONFIG_HOME is optional.
        }
        candidates.push(home + "/.config/lyx/lyxpipe");
        candidates.push(home + "/.config/LyX/lyxpipe");
        return candidates;
    },

    detectLyXServerPath(configuredPath) {
        const resolvedPath = this.resolvePath(configuredPath);
        if (Zotero.isWin || configuredPath !== this.getDefaultLyXServerPath()) {
            return resolvedPath;
        }
        const candidates = [
            resolvedPath,
            ...this.getMacLyXServerCandidates(),
            ...this.getLinuxLyXServerCandidates()
        ];
        return candidates.find(path => this.pipeExists(path)) || resolvedPath;
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
