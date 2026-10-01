"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { resolve, join } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const root = resolve(__dirname, "..");

// Minimal DOM adapter for the actual window controller. No test-only controller logic.
class Element {
    constructor(tag, id = "") {
        this.tag = tag; this.id = id; this.children = []; this.dataset = {}; this.attributes = {};
        this.listeners = {}; this.disabled = false; this.checked = false; this.hidden = false;
        this.value = ""; this.className = ""; this.textContent = "";
    }
    append(...elements) { this.children.push(...elements); }
    replaceChildren(...elements) { this.children = elements; this.textContent = ""; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    setAttribute(key, value) { this.attributes[key] = value; }
    querySelectorAll(selector) {
        return this.children.flatMap(child => [child, ...child.querySelectorAll(selector)]).filter(child =>
            selector === "[data-string]" ? !!child.dataset.string : child.tag === selector);
    }
    scrollIntoView() {}
    focus() { this.focused = true; }
    async fire(type) { return this.listeners[type]?.(); }
}

function fixture(options = {}) {
    const html = fs.readFileSync(join(root, "addon/chrome/content/lyz/mapping-manager.xhtml"), "utf8");
    const elements = new Map();
    const strings = [];
    for (const [, tag, attrs] of html.matchAll(/<([a-z]+)([^<>]*?)>/g)) {
        const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
        const element = new Element(tag, id);
        const string = /data-string="([^"]+)"/.exec(attrs)?.[1];
        if (string) { element.dataset.string = string; strings.push(element); }
        if (id) elements.set(id, element);
        const view = /data-view="([^"]+)"/.exec(attrs)?.[1];
        if (view) { element.dataset.view = view; elements.get("tabs").append(element); }
    }
    const document = {
        getElementById: id => elements.get(id),
        querySelectorAll: selector => selector === "[data-string]" ? strings : [],
        createElementNS: (_ns, tag) => new Element(tag)
    };
    const window = { listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; } };
    const context = vm.createContext({ document, window, setTimeout });
    vm.runInContext(fs.readFileSync(join(root, "addon/chrome/content/lyz/mapping-manager.js"), "utf8"), context);
    const ok = { state: "ok" };
    const data = {
        docs: [{ id: 1, doc: "/árvíztűrő/main.lyx", bib: "/library.bib", file: ok, bibliography: ok },
            { id: 2, doc: "/missing.lyx", bib: "/library.bib", file: { state: "missing" }, bibliography: ok }],
        bibs: [{ bib: "/library.bib", file: ok, documents: 2, keys: 65 }],
        keys: Array.from({ length: 65 }, (_, id) => ({ id, key: "key-" + id, zid: "1_" + id, title: "Title " + id,
            bib: "/library.bib", itemState: "ok", file: ok })),
        recovery: [], archive: [], errors: [], editable: !options.readonly
    };
    const calls = [];
    const api = {
        localize: (id, args) => id + (args ? " " + JSON.stringify(args) : ""),
        inventory: async () => structuredClone(data),
        discard: id => calls.push(["discard", id]),
        chooseFile: async () => options.cancelPicker ? null : "/relocated/main.lyx",
        preview: async request => {
            calls.push(["preview", request]);
            return { ...request, id: "plan-1", documents: 1, keys: 0, affected: [request.source], sourceMissing: true };
        },
        apply: async id => {
            calls.push(["apply", id]);
            if (options.failApply) throw new Error("stale preview");
            data.docs = data.docs.filter(row => row.doc !== "/missing.lyx");
            return true;
        },
        export: async () => calls.push(["export"])
    };
    return { manager: context.LyZMappingManager, document, window, elements, api, calls, data };
}

test("the real window controller renders records, folds accent searches and filters missing files", async () => {
    const f = fixture();
    await f.manager.init(f.api);
    assert.equal(f.elements.get("rows").children.length, 2);
    f.elements.get("search").value = "arvizturo";
    await f.elements.get("search").fire("input");
    assert.equal(f.elements.get("rows").children.length, 1);
    assert.match(f.elements.get("rows").children[0].children[1].textContent, /árvíztűrő/);
    f.elements.get("search").value = "";
    f.elements.get("problems").checked = true;
    await f.elements.get("problems").fire("change");
    assert.equal(f.elements.get("rows").children.length, 1);
    assert.equal(f.elements.get("rows").children[0].children[1].textContent, "/missing.lyx");
});

test("pagination is usable after asynchronous refresh and switching tabs clears selections", async () => {
    const f = fixture();
    await f.manager.init(f.api);
    const input = f.elements.get("rows").querySelectorAll("input")[0];
    await input.fire("change");
    assert.ok(f.manager.selected);
    assert.equal(f.manager.selected.doc, "/árvíztűrő/main.lyx");
    assert.equal(f.elements.get("rows").querySelectorAll("input")[0].focused, true);
    await f.elements.get("tabs").children.find(button => button.dataset.view === "keys").fire("click");
    assert.equal(f.manager.selected, null);
    assert.equal(f.elements.get("rows").children.length, 50);
    assert.equal(f.elements.get("next").disabled, false);
    await f.elements.get("next").fire("click");
    assert.equal(f.elements.get("rows").children.length, 15);
    assert.equal(f.elements.get("previous").disabled, false);
    await f.manager.refresh();
    assert.equal(f.elements.get("previous").disabled, false);
    assert.equal(f.elements.get("next").disabled, true);
});

test("selection, preview, acknowledgment and apply form an explicit save flow", async () => {
    const f = fixture();
    await f.manager.init(f.api);
    await f.elements.get("rows").querySelectorAll("input")[1].fire("change");
    await f.manager.preview(true);
    assert.equal(f.elements.get("preview").hidden, false);
    assert.equal(f.elements.get("apply").disabled, true);
    assert.equal(f.calls.some(([call]) => call === "apply"), false);
    await f.manager.apply();
    assert.equal(f.calls.some(([call]) => call === "apply"), false);
    f.elements.get("acknowledge").checked = true;
    await f.elements.get("acknowledge").fire("change");
    assert.equal(f.elements.get("apply").disabled, false);
    await f.manager.apply();
    assert.ok(f.calls.some(([call, id]) => call === "apply" && id === "plan-1"));
    assert.equal(f.elements.get("preview").hidden, true);
    assert.equal(f.elements.get("rows").children.length, 1);
    assert.match(f.elements.get("message").textContent, /saved/);
});

test("canceling a picker or changing the search cannot save an abandoned preview", async () => {
    const f = fixture({ cancelPicker: true });
    await f.manager.init(f.api);
    await f.elements.get("rows").querySelectorAll("input")[0].fire("change");
    await f.manager.preview(true);
    assert.equal(f.calls.length, 0);
    await f.manager.preview(false);
    f.elements.get("search").value = "new search";
    await f.elements.get("search").fire("input");
    assert.equal(f.manager.plan, null);
    assert.equal(f.elements.get("preview").hidden, true);
    assert.ok(f.calls.some(([call]) => call === "discard"));
    assert.equal(f.calls.some(([call]) => call === "apply"), false);
});

test("read-only mode keeps inspection and export available while all change actions stay disabled", async () => {
    const f = fixture({ readonly: true });
    await f.manager.init(f.api);
    await f.elements.get("rows").querySelectorAll("input")[0].fire("change");
    assert.equal(f.elements.get("relink").disabled, true);
    assert.equal(f.elements.get("remove").disabled, true);
    await f.manager.preview(false);
    assert.equal(f.calls.length, 0);
    await f.elements.get("export").fire("click");
    assert.deepEqual(f.calls, [["export"]]);
});

test("a failed apply refreshes the view and clears the stale preview with an inline error", async () => {
    const f = fixture({ failApply: true });
    await f.manager.init(f.api);
    await f.elements.get("rows").querySelectorAll("input")[1].fire("change");
    await f.manager.preview(false);
    f.elements.get("acknowledge").checked = true;
    await f.manager.apply();
    assert.equal(f.manager.plan, null);
    assert.equal(f.elements.get("message").className, "error");
    assert.equal(f.elements.get("message").textContent, "stale preview");
    assert.equal(f.elements.get("rows").children.length, 2);
    assert.equal(f.elements.get("refresh").disabled, false);
});

test("paths and raw journals are rendered as text rather than executable markup", async () => {
    const f = fixture();
    const hostile = '<img src=x onerror="alert(1)" />';
    f.data.docs[0].doc = hostile;
    f.data.recovery.push({ id: "lyz-1", bib: "/library.bib", state: "prepared", journal: hostile });
    f.data.archive.push({ id: 1, source: "docs", record: "null" });
    await f.manager.init(f.api);
    assert.equal(f.elements.get("rows").children[0].children[1].textContent, hostile);
    assert.equal(f.elements.get("rows").querySelectorAll("img").length, 0);
    await f.elements.get("tabs").children.find(button => button.dataset.view === "recovery").fire("click");
    assert.equal(f.elements.get("rows").querySelectorAll("pre")[0].textContent, hostile);
    await f.elements.get("tabs").children.find(button => button.dataset.view === "archive").fire("click");
    assert.equal(f.elements.get("rows").querySelectorAll("pre")[0].textContent, "null");
});

test("repeated searches reuse normalized record text and refresh invalidates the index", async () => {
    const f = fixture();
    let indexed = 0;
    const fold = f.manager.fold.bind(f.manager);
    f.manager.fold = text => { if (String(text).startsWith('{"id":')) indexed++; return fold(text); };
    await f.manager.init(f.api);
    f.manager.view = "keys";
    f.elements.get("search").value = "Title";
    assert.equal(f.manager.records().length, 65);
    f.elements.get("search").value = "title 1";
    assert.equal(f.manager.records().length, 11);
    assert.equal(indexed, 67);
    f.data.keys[0].title = "Changed title";
    f.elements.get("search").value = "Changed";
    await f.manager.refresh();
    assert.equal(f.manager.records().length, 1);
    assert.equal(indexed, 134);
});

test("large search indexes yield to UI events before indexing completes", async () => {
    const f = fixture();
    f.data.keys = Array.from({ length: 2500 }, (_, id) => ({ ...f.data.keys[0], id, title: "Scale " + id }));
    let ticked = false, processed = 0, responsiveAtEnd = false;
    const index = f.manager.indexedText.bind(f.manager);
    f.manager.indexedText = row => {
        if (++processed === 1) setTimeout(() => { ticked = true; }, 0);
        if (processed === 2503) responsiveAtEnd = ticked;
        return index(row);
    };
    await f.manager.init(f.api);
    assert.equal(responsiveAtEnd, true);
    f.manager.view = "keys";
    f.elements.get("search").value = "Scale 2499";
    assert.equal(f.manager.records().length, 1);
});
