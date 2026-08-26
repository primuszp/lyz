"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { DatabaseSync } = require("node:sqlite");

const projectRoot = resolve(__dirname, "..");

function loadScript(relativePath, globals = {}) {
    const context = vm.createContext(globals);
    vm.runInContext(readFileSync(resolve(projectRoot, relativePath), "utf8"), context);
    return context;
}

test("BibTeX helpers replace only the entry key and preserve field values", () => {
    const { LyZBibTeX } = loadScript("addon/chrome/content/lyz/bibtex-service.js", {
        Zotero: {},
        LyZDatabase: {},
        lyz_charmap: {}
    });
    const source = "@article{old,\n  title={An old result}\n}";

    assert.equal(
        LyZBibTeX.replaceBibTeXKey(source, "old", "new"),
        "@article{new,\n  title={An old result}\n}"
    );
    assert.equal(LyZBibTeX.extractBibTeXKey(source), "old");
    assert.equal(LyZBibTeX.escapeUnicodeForBibTeX("Árvíztűrő"), "{\\'A}rv{\\'i}zt{\\H{u}}r{\\H{o}}");
});

test("Unix LyX pipe paths expand the home-directory shorthand", () => {
    const { LyZSettings } = loadScript("addon/chrome/content/lyz/settings-service.js", {
        Zotero: { isWin: false },
        Components: { interfaces: { nsIFile: {} } },
        Services: {
            dirsvc: { get: () => ({ path: "/Users/tester" }) },
            prefs: { getBranch: () => ({}) }
        }
    });

    assert.equal(LyZSettings.resolvePath("~/.lyx/lyxpipe"), "/Users/tester/.lyx/lyxpipe");
    assert.equal(LyZSettings.resolvePath("/tmp/lyxpipe"), "/tmp/lyxpipe");
});

test("macOS auto-detection keeps the portable default and selects a live versioned LyX pipe", () => {
    const { LyZSettings } = loadScript("addon/chrome/content/lyz/settings-service.js", {
        Zotero: { isWin: false, isLinux: false },
        Components: { interfaces: { nsIFile: {} } },
        Services: {
            dirsvc: { get: () => ({ path: "/Users/tester" }) },
            prefs: { getBranch: () => ({}) }
        }
    });
    LyZSettings.getMacLyXServerCandidates = () => [
        "/Users/tester/Library/Application Support/LyX-2.5/.lyxpipe",
        "/Users/tester/Library/Application Support/LyX-2.4/.lyxpipe"
    ];
    LyZSettings.getLinuxLyXServerCandidates = () => [];
    LyZSettings.pipeExists = path => path.includes("LyX-2.5");

    assert.equal(LyZSettings.getDefaultLyXServerPath(), "~/.lyx/lyxpipe");
    assert.equal(
        LyZSettings.detectLyXServerPath("~/.lyx/lyxpipe"),
        "/Users/tester/Library/Application Support/LyX-2.5/.lyxpipe"
    );
    assert.equal(LyZSettings.detectLyXServerPath("/custom/lyxpipe"), "/custom/lyxpipe");
});

test("Zotero 10 compatibility is declared in install and update metadata", () => {
    const manifest = JSON.parse(readFileSync(resolve(projectRoot, "addon/manifest.json"), "utf8"));
    const updates = JSON.parse(readFileSync(resolve(projectRoot, "deploy/updates.json"), "utf8"));

    assert.equal(manifest.applications.zotero.strict_max_version, "10.0.*");
    assert.equal(
        updates.addons["lyz@zotero.org"].updates[0].applications.zotero.strict_max_version,
        "10.0.*"
    );
});

function loadLyz(database = {}) {
    const Zotero = { Promise: { coroutine: generator => generator } };
    return loadScript("addon/chrome/content/lyz/lyz.js", {
        Zotero,
        Services: {
            console: { logStringMessage: () => {} },
            prompt: { confirm: () => true }
        },
        PathUtils: {},
        LyZDatabase: database,
        LyZBibTeX: {},
        LyZServer: {},
        LyZLocale: { getString: id => id }
    }).Zotero.Lyz;
}

test("a rebuilt bibliography is written before its key mappings are updated", async () => {
    const events = [];
    const lyz = loadLyz({
        getKeysForBib: async () => [{ zid: "1_A", key: "old" }],
        updateKey: async () => events.push("database")
    });
    lyz.getZoteroItem = () => ({ key: "A" });
    lyz.wm = { getMostRecentWindow: () => ({}) };
    lyz.exportToBibtex = async () => ({ "1_A": ["new", "@article{new,}\n"] });
    lyz.writeBib = () => events.push("file");

    assert.equal(await lyz.rebuildBibtexFromDatabase("paper.bib"), true);
    assert.deepEqual(events, ["file", "database"]);
});

test("citation mappings are inserted only after the bibliography write succeeds", async () => {
    const events = [];
    const database = {
        getDocumentRecord: async () => [{ bib: "/tmp/paper.bib" }],
        findKey: async () => [],
        insertKey: async () => events.push("database")
    };
    const lyz = loadLyz(database);
    const win = {
        ZoteroPane: { getSelectedItems: () => [{ key: "A" }] },
        confirm: () => true,
        alert: () => {}
    };
    lyz.wm = { getMostRecentWindow: () => win };
    lyz.lyxGetDoc = async () => "paper.lyx";
    lyz.fileExists = () => true;
    lyz.exportToBibtex = async () => ({ "1_A": ["citekey", "@article{citekey,}\n"] });
    lyz.writeBib = () => events.push("file");
    lyz._lyxAskServer = async () => true;
    lyz.os = "Linux";

    await lyz.checkAndCite();
    assert.deepEqual(events, ["file", "database"]);
});

test("a failed bibliography write does not create a citation mapping", async () => {
    let mappings = 0;
    const lyz = loadLyz({
        getDocumentRecord: async () => [{ bib: "/tmp/paper.bib" }],
        findKey: async () => [],
        insertKey: async () => mappings++
    });
    const win = {
        ZoteroPane: { getSelectedItems: () => [{ key: "A" }] },
        alert: () => {}
    };
    lyz.wm = { getMostRecentWindow: () => win };
    lyz.lyxGetDoc = async () => "paper.lyx";
    lyz.fileExists = () => true;
    lyz.exportToBibtex = async () => ({ "1_A": ["citekey", "@article{citekey,}\n"] });
    lyz.writeBib = () => { throw new Error("disk full"); };
    lyz.os = "Linux";

    await assert.rejects(lyz.checkAndCite(), /disk full/);
    assert.equal(mappings, 0);
});

test("LyX response parser selects the requested client and latest response", () => {
    const { LyZServer } = loadScript("addon/chrome/content/lyz/lyx-server.js");
    const response = [
        "INFO:other:server-get-filename:other.lyx",
        "INFO:lyz2:server-get-filename:first.lyx",
        "INFO:lyz2:server-get-filename:final.lyx"
    ].join("\n");

    assert.equal(
        LyZServer.parseResponseForClient("lyz2", "server-get-filename", response),
        "final.lyx"
    );
    assert.equal(LyZServer.parseResponseForClient("missing", "server-get-filename", response), null);
});

test("LyX polling yields asynchronously until the client response arrives", async () => {
    const { LyZServer } = loadScript("addon/chrome/content/lyz/lyx-server.js");
    let reads = 0;
    LyZServer.responseTimeoutMS = 100;
    LyZServer.pollIntervalMS = 1;
    LyZServer.delay = () => Promise.resolve();
    LyZServer.readPipeOutput = () => {
        reads += 1;
        return reads < 2 ? "" : "INFO:lyz1:server-get-xy:10 20";
    };

    const response = await LyZServer.waitForClientResponse({}, "lyz1", "server-get-xy", "");

    assert.equal(response, "INFO:lyz1:server-get-xy:10 20");
    assert.equal(reads, 2);
});

class TestDBConnection {
    constructor() {
        this.database = new DatabaseSync(":memory:");
    }

    async queryAsync(sql, params = []) {
        const statement = this.database.prepare(sql);
        if (/^\s*(SELECT|PRAGMA)/i.test(sql)) {
            return statement.all(...params);
        }
        statement.run(...params);
        return [];
    }

    async executeTransaction(callback) {
        this.database.exec("BEGIN");
        try {
            const result = await callback();
            this.database.exec("COMMIT");
            return result;
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }

    async closeDatabase() {
        this.database.close();
    }
}

test("database initialization consolidates duplicates and enforces stable mappings", async () => {
    const { LyZDatabase } = loadScript("addon/chrome/content/lyz/database-service.js", {
        Zotero: { DBConnection: TestDBConnection }
    });
    const lyz = {};
    await LyZDatabase.init(lyz);

    await LyZDatabase.addDocument(lyz, "paper.lyx", "old.bib");
    await LyZDatabase.addDocument(lyz, "paper.lyx", "new.bib");
    await LyZDatabase.insertKey(lyz, "first", "new.bib", "1_A");
    await LyZDatabase.insertKey(lyz, "updated", "new.bib", "1_A");

    assert.deepEqual(
        Array.from(await LyZDatabase.getDocumentRecord(lyz, "paper.lyx"), row => ({ ...row })),
        [{ doc: "paper.lyx", bib: "new.bib" }]
    );
    assert.deepEqual(
        Array.from(await LyZDatabase.findKey(lyz, "new.bib", "1_A"), row => ({ ...row })),
        [{ key: "updated" }]
    );

    await LyZDatabase.close(lyz);
});

test("renaming a bibliography merges overlapping key mappings atomically", async () => {
    const { LyZDatabase } = loadScript("addon/chrome/content/lyz/database-service.js", {
        Zotero: { DBConnection: TestDBConnection }
    });
    const lyz = {};
    await LyZDatabase.init(lyz);
    await LyZDatabase.insertKey(lyz, "old-key", "old.bib", "1_A");
    await LyZDatabase.insertKey(lyz, "existing-key", "new.bib", "1_A");
    await LyZDatabase.insertKey(lyz, "second-key", "old.bib", "1_B");

    await LyZDatabase.renameBib(lyz, "new.bib", "old.bib");

    assert.deepEqual(
        Array.from(await LyZDatabase.getKeysForBib(lyz, "new.bib"), row => ({ ...row }))
            .sort((left, right) => left.zid.localeCompare(right.zid)),
        [
            { zid: "1_A", key: "old-key" },
            { zid: "1_B", key: "second-key" }
        ]
    );
    assert.equal((await LyZDatabase.getKeysForBib(lyz, "old.bib")).length, 0);

    await LyZDatabase.close(lyz);
});

test("renaming a document replaces an existing target mapping without duplicates", async () => {
    const { LyZDatabase } = loadScript("addon/chrome/content/lyz/database-service.js", {
        Zotero: { DBConnection: TestDBConnection }
    });
    const lyz = {};
    await LyZDatabase.init(lyz);
    await LyZDatabase.addDocument(lyz, "old.lyx", "source.bib");
    await LyZDatabase.addDocument(lyz, "new.lyx", "previous.bib");

    await LyZDatabase.renameDocument(lyz, "new.lyx", "old.lyx");

    assert.deepEqual(
        Array.from(await LyZDatabase.getDocumentRecord(lyz, "new.lyx"), row => ({ ...row })),
        [{ doc: "new.lyx", bib: "source.bib" }]
    );
    assert.equal((await LyZDatabase.getDocumentRecord(lyz, "old.lyx")).length, 0);

    await LyZDatabase.close(lyz);
});
