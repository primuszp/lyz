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
    windows: new Set(),

    async init(rootURI) {
        this.rootURI = rootURI;
        this.debug("init start: " + rootURI, true);
        this.installCompatibilityShims();
        Services.scriptloader.loadSubScript(rootURI + "chrome/content/lyz/lyz.js");
        Zotero.Lyz.rootURI = rootURI;
        this.debug("lyz.js loaded");
        await Zotero.uiReadyPromise;
        this.debug("uiReadyPromise resolved");
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
                        onShowing: (event, context) => this.setMenuLabel(context, "LyZ"),
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
                        onShowing: (event, context) => this.setMenuLabel(context, "Cite in LyX"),
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

    getMenuItems() {
        return [
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, "Cite in LyX"),
                onCommand: () => this.runCommand("checkAndCite")
            },
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, "Update BibTeX"),
                onCommand: () => this.runCommand("updateBibtexAll")
            },
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, "Delete BibTeX record..."),
                onCommand: () => this.runCommand("dbDeleteBib")
            },
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, "Delete LyX document record..."),
                onCommand: () => this.runCommand("dbDeleteDoc")
            },
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, "Rename BibTeX record..."),
                onCommand: () => this.runCommand("dbRenameBib")
            },
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, "Rename LyX document record..."),
                onCommand: () => this.runCommand("dbRenameDoc")
            },
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, "Settings..."),
                onCommand: () => this.runCommand("settings")
            },
            {
                menuType: "menuitem",
                onShowing: (event, context) => this.setMenuLabel(context, "LyX command..."),
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
        if (!window) {
            return;
        }
        this.windows.add(window);

        const doc = window.document;
        this.debug(
            "addToWindow: toolsPopup=" + !!doc.getElementById("menu_ToolsPopup")
            + ", itemMenu=" + !!doc.getElementById("zotero-itemmenu")
            + ", menuManager=" + !!Zotero.MenuManager,
            true
        );
        this.ensureWindowMenus(window);
        window.setTimeout(() => this.ensureWindowMenus(window), 1000);
        window.setTimeout(() => this.ensureWindowMenus(window), 3000);

        const hasStylesheet = Array.from(doc.childNodes).some(node =>
            node.nodeType === 7 &&
            node.target === "xml-stylesheet" &&
            node.data.includes("chrome://lyz/skin/overlay.css")
        );
        if (!hasStylesheet) {
            const stylesheet = doc.createProcessingInstruction(
                "xml-stylesheet",
                'id="lyz-overlay-stylesheet" href="chrome://lyz/skin/overlay.css" type="text/css"'
            );
            doc.insertBefore(stylesheet, doc.documentElement);
        }

        const toolbar = doc.getElementById("zotero-items-toolbar");
        if (toolbar && !doc.getElementById("lyz-menu-button")) {
            const button = this.createXULElement(doc, "toolbarbutton", {
                id: "lyz-menu-button",
                tooltiptext: "LyZ",
                type: "menu",
                wantdropmarker: "true",
                class: "zotero-tb-button"
            });
            button.style.listStyleImage = `url("${this.rootURI}chrome/skin/default/lyz/lyz.png")`;
            const popup = this.createXULElement(doc, "menupopup", { id: "lyz-menupopup" });
            button.appendChild(popup);

            this.appendMenuItem(doc, popup, "lyz-send", "Cite in LyX", () => this.runCommandSync("checkAndCite"), "Send citation to LyX");
            this.appendMenuItem(doc, popup, "lyz-update-bibtex", "Update BibTeX", () => this.runCommandSync("updateBibtexAll"), "Update modified items in BibTeX file");
            popup.appendChild(this.createXULElement(doc, "menuseparator"));
            this.appendMenuItem(doc, popup, "lyz-delete-bib", "Delete BibTeX record...", () => this.runCommandSync("dbDeleteBib"));
            this.appendMenuItem(doc, popup, "lyz-delete-doc", "Delete LyX document record...", () => this.runCommandSync("dbDeleteDoc"));
            popup.appendChild(this.createXULElement(doc, "menuseparator"));
            this.appendMenuItem(doc, popup, "lyz-rename-bib", "Rename BibTeX record...", () => this.runCommandSync("dbRenameBib"));
            this.appendMenuItem(doc, popup, "lyz-rename-doc", "Rename LyX document record...", () => this.runCommandSync("dbRenameDoc"));
            popup.appendChild(this.createXULElement(doc, "menuseparator"));
            this.appendMenuItem(doc, popup, "lyz-settings", "Settings...", () => this.runCommandSync("settings"));
            popup.appendChild(this.createXULElement(doc, "menuseparator"));
            this.appendMenuItem(doc, popup, "lyz-test", "LyX command...", () => this.runCommandSync("test"));

            const anchor = doc.getElementById("zotero-tb-attachment-add");
            if (anchor && anchor.nextSibling) {
                toolbar.insertBefore(button, anchor.nextSibling);
            } else {
                toolbar.appendChild(button);
            }
        }

    },

    addToolsMenuFallback(doc) {
        if (doc.getElementById("lyz-tools-fallback-menu")) {
            return;
        }
        const toolsPopup = doc.getElementById("menu_ToolsPopup")
            || doc.getElementById("tools-menu-popup")
            || doc.querySelector("#tools-menu menupopup, #menu_ToolsPopup");
        if (!toolsPopup) {
            this.debug("DOM fallback: tools popup not found");
            return;
        }
        const menu = this.createXULElement(doc, "menu", {
            id: "lyz-tools-fallback-menu",
            label: "LyZ"
        });
        const popup = this.createXULElement(doc, "menupopup", { id: "lyz-tools-fallback-popup" });
        menu.appendChild(popup);
        this.appendLyzCommandItems(doc, popup, "tools");
        toolsPopup.appendChild(menu);
        this.debug("DOM fallback: tools menu inserted", true);
    },

    addItemContextFallback(doc) {
        if (doc.getElementById("lyz-context-cite")) {
            return;
        }
        const itemMenu = doc.getElementById("zotero-itemmenu")
            || doc.getElementById("zotero-item-context-menu")
            || doc.querySelector("#zotero-itemmenu, #zotero-item-context-menu");
        if (!itemMenu) {
            this.debug("DOM fallback: item context menu not found");
            return;
        }
        itemMenu.appendChild(this.createXULElement(doc, "menuseparator", { id: "lyz-context-separator" }));
        this.appendMenuItem(doc, itemMenu, "lyz-context-cite", "Cite in LyX", () => this.runCommand("checkAndCite"));
        this.debug("DOM fallback: item context menu inserted");
    },

    appendLyzCommandItems(doc, popup, prefix) {
        this.appendMenuItem(doc, popup, `lyz-${prefix}-cite`, "Cite in LyX", () => this.runCommand("checkAndCite"));
        this.appendMenuItem(doc, popup, `lyz-${prefix}-update-bibtex`, "Update BibTeX", () => this.runCommand("updateBibtexAll"));
        popup.appendChild(this.createXULElement(doc, "menuseparator"));
        this.appendMenuItem(doc, popup, `lyz-${prefix}-delete-bib`, "Delete BibTeX record...", () => this.runCommand("dbDeleteBib"));
        this.appendMenuItem(doc, popup, `lyz-${prefix}-delete-doc`, "Delete LyX document record...", () => this.runCommand("dbDeleteDoc"));
        popup.appendChild(this.createXULElement(doc, "menuseparator"));
        this.appendMenuItem(doc, popup, `lyz-${prefix}-rename-bib`, "Rename BibTeX record...", () => this.runCommand("dbRenameBib"));
        this.appendMenuItem(doc, popup, `lyz-${prefix}-rename-doc`, "Rename LyX document record...", () => this.runCommand("dbRenameDoc"));
        popup.appendChild(this.createXULElement(doc, "menuseparator"));
        this.appendMenuItem(doc, popup, `lyz-${prefix}-settings`, "Settings...", () => this.runCommand("settings"));
        popup.appendChild(this.createXULElement(doc, "menuseparator"));
        this.appendMenuItem(doc, popup, `lyz-${prefix}-test`, "LyX command...", () => this.runCommand("test"));
    },

    removeFromWindow(window) {
        if (!window) {
            return;
        }
        this.windows.delete(window);
        const doc = window.document;
        for (const id of ["lyz-menu-button", "lyz-context-separator", "lyz-context-cite", "lyz-tools-fallback-menu"]) {
            const element = doc.getElementById(id);
            if (element) {
                element.remove();
            }
        }
        for (const node of doc.childNodes) {
            if (
                node.nodeType === 7 &&
                node.target === "xml-stylesheet" &&
                node.data.includes("chrome://lyz/skin/overlay.css")
            ) {
                node.remove();
                break;
            }
        }
    },

    ensureWindowMenus(window) {
        if (!window || window.closed) {
            return;
        }
        this.registerMenus();
        if (!this.hasRegisteredMenus()) {
            this.addToolsMenuFallback(window.document);
            this.addItemContextFallback(window.document);
        }
    },

    shutdown() {
        while (this.menuIDs.length) {
            Zotero.MenuManager.unregisterMenu(this.menuIDs.pop());
        }
        if (this.chromeHandle) {
            this.chromeHandle.destruct();
            this.chromeHandle = null;
        }
        this.initialized = false;
    },

    createXULElement(doc, name, attributes = {}) {
        const element = doc.createXULElement
            ? doc.createXULElement(name)
            : doc.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", name);
        for (const [key, value] of Object.entries(attributes)) {
            element.setAttribute(key, value);
        }
        return element;
    },

    appendMenuItem(doc, parent, id, label, command, tooltiptext) {
        const item = this.createXULElement(doc, "menuitem", { id, label });
        if (tooltiptext) {
            item.setAttribute("tooltiptext", tooltiptext);
        }
        item.addEventListener("command", command);
        parent.appendChild(item);
        return item;
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
