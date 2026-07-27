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
