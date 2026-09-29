"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { resolve, join } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const root = resolve(__dirname, "..");
const addon = join(root, "addon/chrome/content/lyz");

// Minimal XUL/HTML element adapter; the pane controller, settings and key logic are the shipped scripts.
class Element {
    constructor(tag, attributes = {}) {
        this.tag = tag; this.attributes = { ...attributes }; this.children = []; this.listeners = {};
        this.value = ""; this.textContent = ""; this.hidden = false; this.disabled = false; this.checked = false;
        this.selectedItem = null; this.selectedIndex = -1;
    }
    get firstChild() { return this.children[0] || null; }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    querySelectorAll(tag) { return this.children.flatMap(child => [child, ...child.querySelectorAll(tag)]).filter(child => child.tag === tag); }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    async fire(type) { for (const listener of this.listeners[type] || []) await listener(); }
}

function locale(name) {
    const text = fs.readFileSync(join(root, "addon/locale", name, "lyz.ftl"), "utf8");
    return Object.fromEntries([...text.matchAll(/^(lyz-pref-[a-z-]+) = (.+)$/gm)].map(([, id, value]) => [id, value]));
}

function fixture(options = {}) {
    const html = fs.readFileSync(join(addon, "preferences.xhtml"), "utf8");
    const elements = new Map();
    let menulist = null;
    for (const [, tag, attrs] of html.matchAll(/<([a-z:]+)([^<>]*?)\/?>/g)) {
        const attributes = Object.fromEntries([...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
        const element = new Element(tag, attributes);
        if (attributes.id) elements.set(attributes.id, element);
        if (tag === "menulist") menulist = element;
        if (tag === "menuitem" && menulist) menulist.appendChild(element);
    }
    const strings = locale(options.locale || "en-US");
    const prefs = new Map(Object.entries(options.prefs || {}));
    const probes = [];
    const context = vm.createContext({
        document: {
            getElementById: id => elements.get(id),
            createXULElement: tag => new Element(tag)
        },
        window: { addEventListener() {} },
        setTimeout: () => 0, clearTimeout() {},
        Services: {
            console: { logStringMessage() {} },
            prefs: {
                savePrefFile() {},
                getBranch: () => ({
                    getStringPref: key => { if (!prefs.has(key)) throw new Error("missing"); return prefs.get(key); },
                    setStringPref: (key, value) => prefs.set(key, value),
                    getBoolPref: key => { if (!prefs.has(key)) throw new Error("missing"); return prefs.get(key); },
                    setBoolPref: (key, value) => prefs.set(key, value)
                })
            }
        },
        LyZLocale: {
            getString: (id, args = {}) => (strings[id] ?? id).replace(/\{ \$([\w-]+) \}/g, (_, name) => args[name])
        },
        Zotero: {
            isWin: true,
            logError() {},
            Translators: { getAllForType: async () => [] },
            Lyz: options.noLyz ? undefined : {
                testConnection: () => new Promise(resolve => probes.push(resolve))
            }
        },
        LyZDatabase: {}, lyz_charmap: {}
    });
    for (const file of ["settings-service.js", "bibtex-service.js", "preferences.js"]) {
        vm.runInContext(fs.readFileSync(join(addon, file), "utf8"), context);
    }
    const text = id => elements.get(id).textContent;
    return { pane: context.LyZ_Preferences, elements, prefs, probes, text };
}

async function selectMode(f, mode) {
    const menu = f.elements.get("lyz-citekey-mode");
    menu.selectedItem = menu.children.find(item => item.getAttribute("value") === mode);
    await menu.fire("command");
}

test("the pane opens with an untested connection and a live example key", async () => {
    const f = fixture();
    await f.pane.init();
    assert.equal(f.elements.get("lyz-connection-status").getAttribute("data-state"), "idle");
    assert.equal(f.text("lyz-connection-title"), "Connection not tested");
    assert.equal(f.text("lyz-citekey-preview-value"), "einstein1905ontheelectrodynamics");
    assert.match(f.text("lyz-citekey-preview-sample"), /Einstein, A\. \(1905\)/);
    assert.equal(f.elements.get("lyz-citekey-warning").hidden, true);
});

test("typing a pattern updates the preview and flags case mistakes or keyword-free patterns", async () => {
    const f = fixture();
    await f.pane.init();
    const input = f.elements.get("lyz-citekey");

    input.value = "author _ zoteroShort";
    await input.fire("input");
    assert.equal(f.text("lyz-citekey-preview-value"), "einstein_X7K2M9QD");
    assert.equal(f.prefs.get("extensions.lyz.citekey"), "author _ zoteroShort");

    input.value = "Author year";
    await input.fire("input");
    assert.equal(f.text("lyz-citekey-preview-value"), "Author1905");
    assert.equal(f.elements.get("lyz-citekey-warning").hidden, false);
    assert.match(f.text("lyz-citekey-warning"), /“Author”.*“author”/);

    input.value = "draft";
    await input.fire("input");
    assert.equal(f.text("lyz-citekey-preview-value"), "draft");
    assert.match(f.text("lyz-citekey-warning"), /no keyword/);
});

test("key source modes show their own preview and the translator mode hides the example key", async () => {
    const f = fixture();
    await f.pane.init();
    await selectMode(f, "zoteroShort");
    assert.equal(f.text("lyz-citekey-preview-value"), "X7K2M9QD");
    assert.equal(f.elements.get("lyz-citekey").disabled, true);

    await selectMode(f, "translator");
    assert.equal(f.elements.get("lyz-citekey-preview-value").hidden, true);
    assert.match(f.text("lyz-citekey-preview-label"), /export translator creates the keys/);
    assert.equal(f.text("lyz-citekey-preview-sample"), "");
    assert.equal(f.prefs.get("extensions.lyz.createCiteKey"), false);
});

test("Test connection shows progress, then the active LyX document", async () => {
    const f = fixture();
    await f.pane.init();
    const button = f.elements.get("lyz-test-connection");
    const pending = button.fire("command");
    assert.equal(button.disabled, true);
    assert.equal(f.elements.get("lyz-connection-status").getAttribute("data-state"), "checking");
    assert.match(f.text("lyz-connection-path"), /\\\\\.\\pipe\\lyxpipe/);

    f.probes[0]({ state: "ok", path: "\\\\.\\pipe\\lyxpipe", document: "C:/Tézis/fő.lyx" });
    await pending;
    assert.equal(button.disabled, false);
    assert.equal(f.elements.get("lyz-connection-status").getAttribute("data-state"), "ok");
    assert.equal(f.text("lyz-connection-title"), "Connected to LyX");
    assert.equal(f.text("lyz-connection-detail"), "Active document: C:/Tézis/fő.lyx");
});

test("each failure category explains the next step", async () => {
    const f = fixture();
    await f.pane.init();
    for (const [state, title, hint] of [
        ["missing-pipe", "LyXServer pipe not found", /Tools ▸ Preferences ▸ Paths/],
        ["no-response", "LyX did not answer", /Restart LyX/],
        ["no-document", "Connected to LyX, but no document is open", /Open or create/]
    ]) {
        const pending = f.pane.testConnection();
        f.probes.at(-1)({ state, path: "/tmp/lyxpipe" });
        await pending;
        assert.equal(f.elements.get("lyz-connection-status").getAttribute("data-state"), state);
        assert.equal(f.text("lyz-connection-title"), title);
        assert.match(f.text("lyz-connection-detail"), hint);
    }
});

test("editing the path during a test discards the stale result and re-enables testing", async () => {
    const f = fixture();
    await f.pane.init();
    const pending = f.pane.testConnection();
    const input = f.elements.get("lyz-lyxserver");
    input.value = "\\\\.\\pipe\\otherpipe";
    await input.fire("input");
    f.probes[0]({ state: "ok", path: "\\\\.\\pipe\\lyxpipe", document: "old.lyx" });
    assert.equal(await pending, null);
    assert.equal(f.elements.get("lyz-connection-status").getAttribute("data-state"), "idle");
    assert.equal(f.elements.get("lyz-test-connection").disabled, false);
    assert.equal(f.prefs.get("extensions.lyz.lyxserver"), "\\\\.\\pipe\\otherpipe");
});

test("Use default restores the platform pipe and an unavailable plugin reports an error", async () => {
    const f = fixture({ noLyz: true, prefs: { "extensions.lyz.lyxserver": "C:/wrong" } });
    await f.pane.init();
    await f.elements.get("lyz-reset-server").fire("command");
    assert.equal(f.elements.get("lyz-lyxserver").value, "\\\\.\\pipe\\lyxpipe");
    assert.equal(f.prefs.get("extensions.lyz.lyxserver"), "\\\\.\\pipe\\lyxpipe");

    await f.pane.testConnection();
    assert.equal(f.elements.get("lyz-connection-status").getAttribute("data-state"), "error");
    assert.match(f.text("lyz-connection-detail"), /still starting/);
});

test("every new preference string exists in English, German and Hungarian", () => {
    const english = Object.keys(locale("en-US")).filter(id => /connection|citekey-preview|citekey-warning/.test(id));
    assert.ok(english.length >= 18);
    for (const name of ["de-DE", "hu-HU"]) {
        const translated = locale(name);
        for (const id of english) assert.ok(translated[id], name + " is missing " + id);
    }
    const xhtml = fs.readFileSync(join(addon, "preferences.xhtml"), "utf8");
    for (const name of ["en-US", "de-DE", "hu-HU"]) {
        const ftl = fs.readFileSync(join(root, "addon/locale", name, "lyz.ftl"), "utf8");
        for (const [, id] of xhtml.matchAll(/data-l10n-id="([^"]+)"/g)) {
            assert.match(ftl, new RegExp("^" + id + " =", "m"), name + " is missing " + id);
        }
    }
});
