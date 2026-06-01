if (typeof Cc === "undefined") {
    var Cc = Components.classes;
}
if (typeof Ci === "undefined") {
    var Ci = Components.interfaces;
}

const LYZ_DEBUG = false;

var LyZBootstrap = {
    initialized: false,
    rootURI: null,
    chromeHandle: null,
    menuIDs: [],
    preferencePaneID: null,
    windows: new Set(),

    async init(rootURI) {
        this.rootURI = rootURI;
        this.debug("init start: " + rootURI, true);
        this.installCompatibilityShims();
        Services.scriptloader.loadSubScript(rootURI + "chrome/content/lyz/locale-service.js");
        Services.scriptloader.loadSubScript(rootURI + "chrome/content/lyz/settings-service.js");
        Services.scriptloader.loadSubScript(rootURI + "chrome/content/lyz/database-service.js");
        Services.scriptloader.loadSubScript(rootURI + "chrome/content/lyz/bibtex-service.js");
        Services.scriptloader.loadSubScript(rootURI + "chrome/content/lyz/bootstrap-ui.js");
        Services.scriptloader.loadSubScript(rootURI + "chrome/content/lyz/lyx-server.js");
        Services.scriptloader.loadSubScript(rootURI + "chrome/content/lyz/lyz.js");
        Zotero.Lyz.rootURI = rootURI;
        this.debug("lyz.js loaded");
        await Zotero.uiReadyPromise;
        this.debug("uiReadyPromise resolved");
        await this.registerPreferencePane();
        this.registerMenus();
        this.ensureLyzInitialized().catch(e => Zotero.logError(e));
        this.initialized = true;
        this.debug("init complete");
    },

    debug(message, showAlert = false) {
        const text = "LyZ debug: " + message;
        Services.console.logStringMessage(text);
        if (typeof Zotero !== "undefined" && Zotero.debug) {
            Zotero.debug(text);
        }
        if (LYZ_DEBUG && showAlert) {
            try {
                Services.prompt.alert(null, "LyZ debug", message);
            } catch (e) {
                Services.console.logStringMessage("LyZ debug alert failed: " + e);
            }
        }
    },

    installCompatibilityShims() {
        if (!Zotero.Promise) {
            Zotero.Promise = {};
        }
        if (!Zotero.Promise.coroutine) {
            Zotero.Promise.coroutine = function(generatorFunction) {
                return function(...args) {
                    const generator = generatorFunction.apply(this, args);
                    return new Promise((resolve, reject) => {
                        function step(nextFunction, value) {
                            let result;
                            try {
                                result = nextFunction.call(generator, value);
                            } catch (e) {
                                reject(e);
                                return;
                            }
                            if (result.done) {
                                resolve(result.value);
                                return;
                            }
                            Promise.resolve(result.value).then(
                                value => step(generator.next, value),
                                error => step(generator.throw, error)
                            );
                        }
                        step(generator.next);
                    });
                };
            };
            this.debug("installed Zotero.Promise.coroutine shim");
        }
    },

    async ensureLyzInitialized() {
        if (Zotero.Lyz && !Zotero.Lyz.initialized) {
            await Zotero.Lyz.init();
        }
    },

    registerChrome() {
        if (this.chromeHandle) {
            return;
        }
        const aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"]
            .getService(Ci.amIAddonManagerStartup);
        const manifestURI = Services.io.newURI(this.rootURI + "manifest.json");
        this.chromeHandle = aomStartup.registerChrome(manifestURI, [
            ["content", "lyz", "chrome/content/lyz/"],
            ["locale", "lyz", "en-US", "chrome/locale/en-US/lyz/"],
            ["locale", "lyz", "de-DE", "chrome/locale/de-DE/lyz/"],
            ["locale", "lyz", "hu-HU", "chrome/locale/hu-HU/lyz/"],
            ["skin", "lyz", "default", "chrome/skin/default/lyz/"]
        ]);
        this.debug("chrome registered");
    },

    registerMenus() {
        if (this.menuIDs.length) {
            return;
        }
        if (!Zotero.MenuManager) {
            this.debug("Zotero.MenuManager unavailable; using DOM fallback");
            return;
        }

        try {
            const toolsMenuID = Zotero.MenuManager.registerMenu({
                menuID: "lyz-tools-menu",
                pluginID: "lyz@zotero.org",
                target: "main/menubar/tools",
                menus: [
                    {
                        menuType: "submenu",
                        onShowing: (event, context) => this.setMenuLabel(context, LyZLocale.getAttribute("lyz-menu-label", "label")),
                        menus: this.getMenuItems()
                    }
                ]
            });
            if (toolsMenuID) {
                this.menuIDs.push(toolsMenuID);
                this.debug("MenuManager registered tools menu: " + toolsMenuID);
            } else {
                this.debug("MenuManager returned false for tools menu", true);
            }

            const itemMenuID = Zotero.MenuManager.registerMenu({
                menuID: "lyz-item-context-menu",
                pluginID: "lyz@zotero.org",
                target: "main/library/item",
                menus: [
                    {
                        menuType: "menuitem",
                        onShowing: (event, context) => this.setMenuLabel(context, LyZLocale.getAttribute("lyz-cite-label", "label")),
                        onCommand: () => this.runCommand("checkAndCite")
                    }
                ]
            });
            if (itemMenuID) {
                this.menuIDs.push(itemMenuID);
                this.debug("MenuManager registered item menu: " + itemMenuID);
            } else {
                this.debug("MenuManager returned false for item context menu", true);
            }
        } catch (e) {
            Zotero.logError(e);
            this.debug("MenuManager exception: " + e, true);
            this.menuIDs = [];
        }
    },

    hasRegisteredMenus() {
        return this.menuIDs.length > 0;
    },

    async registerPreferencePane() {
        if (this.preferencePaneID || !Zotero.PreferencePanes) {
            return;
        }
        try {
            this.preferencePaneID = await Zotero.PreferencePanes.register({
                pluginID: "lyz@zotero.org",
                id: "lyz-prefpane",
                label: "LyZ",
                image: "chrome/skin/default/lyz/lyz.svg",
                src: "chrome/content/lyz/preferences.xhtml",
                scripts: [
                    "chrome/content/lyz/locale-service.js",
                    "chrome/content/lyz/settings-service.js",
                    "chrome/content/lyz/preferences.js"
                ]
            });
            this.debug("registered preference pane: " + this.preferencePaneID);
        } catch (e) {
            Zotero.logError(e);
            this.debug("preference pane registration failed: " + e);
        }
    },

    getMenuItems() {
        return [
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, LyZLocale.getAttribute("lyz-cite-label", "label")),
                onCommand: () => this.runCommand("checkAndCite")
            },
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, LyZLocale.getAttribute("lyz-update-bibtex-label", "label")),
                onCommand: () => this.runCommand("updateBibtexAll")
            },
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, LyZLocale.getAttribute("lyz-delete-bib-label", "label")),
                onCommand: () => this.runCommand("dbDeleteBib")
            },
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, LyZLocale.getAttribute("lyz-delete-doc-label", "label")),
                onCommand: () => this.runCommand("dbDeleteDoc")
            },
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, LyZLocale.getAttribute("lyz-rename-bib-label", "label")),
                onCommand: () => this.runCommand("dbRenameBib")
            },
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, LyZLocale.getAttribute("lyz-rename-doc-label", "label")),
                onCommand: () => this.runCommand("dbRenameDoc")
            },
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, LyZLocale.getAttribute("lyz-settings-label", "label")),
                onCommand: () => this.runCommand("settings")
            },
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, LyZLocale.getAttribute("lyz-test-label", "label")),
                onCommand: () => this.runCommand("test")
            }
        ];
    },

    setMenuLabel(context, label) {
        if (context && context.menuElem) {
            context.menuElem.setAttribute("label", label);
        }
    },

    runCommand(command) {
        return this.ensureLyzInitialized()
            .then(() => Zotero.Lyz[command]())
            .catch(e => {
                const win = Services.wm.getMostRecentWindow("navigator:browser");
                Zotero.logError(e);
                if (win) {
                    win.alert("LyZ error:\n" + e);
                }
                throw e;
            });
    },

    runCommandSync(command) {
        try {
            this.runCommand(command);
        } catch (e) {
            Zotero.logError(e);
            throw e;
        }
    },

    addToWindow(window) {
        LyZBootstrapUI.addToWindow(window, this);
    },

    addToolsMenuFallback(doc) {
        LyZBootstrapUI.addToolsMenuFallback(doc, this);
    },

    addItemContextFallback(doc) {
        LyZBootstrapUI.addItemContextFallback(doc, this);
    },

    appendLyzCommandItems(doc, popup, prefix) {
        LyZBootstrapUI.appendLyzCommandItems(doc, popup, prefix, this);
    },

    removeFromWindow(window) {
        LyZBootstrapUI.removeFromWindow(window, this);
    },

    ensureWindowMenus(window) {
        LyZBootstrapUI.ensureWindowMenus(window, this);
    },

    shutdown() {
        while (this.menuIDs.length) {
            Zotero.MenuManager.unregisterMenu(this.menuIDs.pop());
        }
        if (this.preferencePaneID && Zotero.PreferencePanes) {
            Zotero.PreferencePanes.unregister(this.preferencePaneID);
            this.preferencePaneID = null;
        }
        if (this.chromeHandle) {
            this.chromeHandle.destruct();
            this.chromeHandle = null;
        }
        this.initialized = false;
    },

    createXULElement(doc, name, attributes = {}) {
        return LyZBootstrapUI.createXULElement(doc, name, attributes);
    },

    appendMenuItem(doc, parent, id, label, command, tooltiptext) {
        return LyZBootstrapUI.appendMenuItem(doc, parent, id, label, command, tooltiptext);
    }
};

async function startup({ rootURI }, reason) {
    LyZBootstrap.debug("startup called, reason=" + reason, true);
    try {
        await LyZBootstrap.init(rootURI);
    } catch (e) {
        LyZBootstrap.debug("startup/init failed: " + e + "\n" + (e.stack || ""), true);
        Zotero.logError(e);
        return;
    }

    const enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements()) {
        LyZBootstrap.addToWindow(enumerator.getNext());
    }
}

function shutdown(data, reason) {
    if (reason === APP_SHUTDOWN) {
        return;
    }
    const enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements()) {
        LyZBootstrap.removeFromWindow(enumerator.getNext());
    }
    if (Zotero.Lyz && Zotero.Lyz.DB) {
        Zotero.Lyz.shutdown().catch(e => Zotero.logError(e));
    }
    LyZBootstrap.shutdown();
}

function install(data, reason) {
    LyZBootstrap.debug("install called, reason=" + reason, true);
}

function uninstall(data, reason) {
    LyZBootstrap.debug("uninstall called, reason=" + reason, true);
}

function onMainWindowLoad({ window }) {
    LyZBootstrap.debug("onMainWindowLoad called", true);
    LyZBootstrap.addToWindow(window);
}

function onMainWindowUnload({ window }) {
    LyZBootstrap.removeFromWindow(window);
}
