var LyZBootstrapUI = {
    addToWindow(window, bootstrap) {
        if (!window) {
            return;
        }
        bootstrap.windows.add(window);

        const doc = window.document;
        bootstrap.debug(
            "addToWindow: toolsPopup=" + !!doc.getElementById("menu_ToolsPopup")
            + ", itemMenu=" + !!doc.getElementById("zotero-itemmenu")
            + ", menuManager=" + !!Zotero.MenuManager,
            true
        );
        this.ensureWindowMenus(window, bootstrap);
        window.setTimeout(() => this.ensureWindowMenus(window, bootstrap), 1000);
        window.setTimeout(() => this.ensureWindowMenus(window, bootstrap), 3000);

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
            button.style.listStyleImage = `url("${bootstrap.rootURI}chrome/skin/default/lyz/lyz.svg")`;
            button.style.setProperty("-moz-context-properties", "fill, fill-opacity");
            button.style.fill = "currentColor";
            const popup = this.createXULElement(doc, "menupopup", { id: "lyz-menupopup" });
            button.appendChild(popup);

            this.appendToolbarCommandItems(doc, popup, bootstrap);

            const anchor = doc.getElementById("zotero-tb-attachment-add");
            if (anchor && anchor.nextSibling) {
                toolbar.insertBefore(button, anchor.nextSibling);
            } else {
                toolbar.appendChild(button);
            }
        }
    },

    appendToolbarCommandItems(doc, popup, bootstrap) {
        this.appendMenuItem(doc, popup, "lyz-send", LyZLocale.getAttribute("lyz-cite-label", "label"), () => bootstrap.runCommandSync("checkAndCite"), LyZLocale.getAttribute("lyz-cite-label", "tooltiptext"));
        this.appendMenuItem(doc, popup, "lyz-update-bibtex", LyZLocale.getAttribute("lyz-update-bibtex-label", "label"), () => bootstrap.runCommandSync("updateBibtexAll"), LyZLocale.getAttribute("lyz-update-bibtex-label", "tooltiptext"));
        popup.appendChild(this.createXULElement(doc, "menuseparator"));
        this.appendMenuItem(doc, popup, "lyz-delete-bib", LyZLocale.getAttribute("lyz-delete-bib-label", "label"), () => bootstrap.runCommandSync("dbDeleteBib"));
        this.appendMenuItem(doc, popup, "lyz-delete-doc", LyZLocale.getAttribute("lyz-delete-doc-label", "label"), () => bootstrap.runCommandSync("dbDeleteDoc"));
        popup.appendChild(this.createXULElement(doc, "menuseparator"));
        this.appendMenuItem(doc, popup, "lyz-rename-bib", LyZLocale.getAttribute("lyz-rename-bib-label", "label"), () => bootstrap.runCommandSync("dbRenameBib"));
        this.appendMenuItem(doc, popup, "lyz-rename-doc", LyZLocale.getAttribute("lyz-rename-doc-label", "label"), () => bootstrap.runCommandSync("dbRenameDoc"));
        popup.appendChild(this.createXULElement(doc, "menuseparator"));
        this.appendMenuItem(doc, popup, "lyz-settings", LyZLocale.getAttribute("lyz-settings-label", "label"), () => bootstrap.runCommandSync("settings"));
        popup.appendChild(this.createXULElement(doc, "menuseparator"));
        this.appendMenuItem(doc, popup, "lyz-test", LyZLocale.getAttribute("lyz-test-label", "label"), () => bootstrap.runCommandSync("test"));
    },

    addToolsMenuFallback(doc, bootstrap) {
        if (doc.getElementById("lyz-tools-fallback-menu")) {
            return;
        }
        const toolsPopup = doc.getElementById("menu_ToolsPopup")
            || doc.getElementById("tools-menu-popup")
            || doc.querySelector("#tools-menu menupopup, #menu_ToolsPopup");
        if (!toolsPopup) {
            bootstrap.debug("DOM fallback: tools popup not found");
            return;
        }
        const menu = this.createXULElement(doc, "menu", {
            id: "lyz-tools-fallback-menu",
            label: LyZLocale.getAttribute("lyz-menu-label", "label")
        });
        const popup = this.createXULElement(doc, "menupopup", { id: "lyz-tools-fallback-popup" });
        menu.appendChild(popup);
        this.appendLyzCommandItems(doc, popup, "tools", bootstrap);
        toolsPopup.appendChild(menu);
        bootstrap.debug("DOM fallback: tools menu inserted", true);
    },

    addItemContextFallback(doc, bootstrap) {
        if (doc.getElementById("lyz-context-cite")) {
            return;
        }
        const itemMenu = doc.getElementById("zotero-itemmenu")
            || doc.getElementById("zotero-item-context-menu")
            || doc.querySelector("#zotero-itemmenu, #zotero-item-context-menu");
        if (!itemMenu) {
            bootstrap.debug("DOM fallback: item context menu not found");
            return;
        }
        itemMenu.appendChild(this.createXULElement(doc, "menuseparator", { id: "lyz-context-separator" }));
        this.appendMenuItem(doc, itemMenu, "lyz-context-cite", LyZLocale.getAttribute("lyz-cite-label", "label"), () => bootstrap.runCommand("checkAndCite"));
        bootstrap.debug("DOM fallback: item context menu inserted");
    },

    appendLyzCommandItems(doc, popup, prefix, bootstrap) {
        this.appendMenuItem(doc, popup, `lyz-${prefix}-cite`, LyZLocale.getAttribute("lyz-cite-label", "label"), () => bootstrap.runCommand("checkAndCite"));
        this.appendMenuItem(doc, popup, `lyz-${prefix}-update-bibtex`, LyZLocale.getAttribute("lyz-update-bibtex-label", "label"), () => bootstrap.runCommand("updateBibtexAll"));
        popup.appendChild(this.createXULElement(doc, "menuseparator"));
        this.appendMenuItem(doc, popup, `lyz-${prefix}-delete-bib`, LyZLocale.getAttribute("lyz-delete-bib-label", "label"), () => bootstrap.runCommand("dbDeleteBib"));
        this.appendMenuItem(doc, popup, `lyz-${prefix}-delete-doc`, LyZLocale.getAttribute("lyz-delete-doc-label", "label"), () => bootstrap.runCommand("dbDeleteDoc"));
        popup.appendChild(this.createXULElement(doc, "menuseparator"));
        this.appendMenuItem(doc, popup, `lyz-${prefix}-rename-bib`, LyZLocale.getAttribute("lyz-rename-bib-label", "label"), () => bootstrap.runCommand("dbRenameBib"));
        this.appendMenuItem(doc, popup, `lyz-${prefix}-rename-doc`, LyZLocale.getAttribute("lyz-rename-doc-label", "label"), () => bootstrap.runCommand("dbRenameDoc"));
        popup.appendChild(this.createXULElement(doc, "menuseparator"));
        this.appendMenuItem(doc, popup, `lyz-${prefix}-settings`, LyZLocale.getAttribute("lyz-settings-label", "label"), () => bootstrap.runCommand("settings"));
        popup.appendChild(this.createXULElement(doc, "menuseparator"));
        this.appendMenuItem(doc, popup, `lyz-${prefix}-test`, LyZLocale.getAttribute("lyz-test-label", "label"), () => bootstrap.runCommand("test"));
    },

    removeFromWindow(window, bootstrap) {
        if (!window) {
            return;
        }
        bootstrap.windows.delete(window);
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

    ensureWindowMenus(window, bootstrap) {
        if (!window || window.closed) {
            return;
        }
        bootstrap.registerMenus();
        if (!bootstrap.hasRegisteredMenus()) {
            this.addToolsMenuFallback(window.document, bootstrap);
            this.addItemContextFallback(window.document, bootstrap);
        }
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
