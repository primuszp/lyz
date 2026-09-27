"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const vm = require("node:vm");

const root = resolve(__dirname, "..");
const script = name => fs.readFileSync(join(root, "addon/chrome/content/lyz", name), "utf8");
const bytes = text => new TextEncoder().encode(text);
const citation = (keys, newline = "\r\n") => [
    "#LyX 2.5 created this file", "\\begin_document", "Árvíztűrő tükörfúrógép",
    "\\begin_inset CommandInset citation", 'LatexCommand citep', 'key "' + keys + '"',
    "\\end_inset", 'key "a,b"', "\\end_document", ""
].join(newline);

async function fixture(t, options = {}) {
    const directory = await fsp.mkdtemp(join(tmpdir(), "lyz-key-update-"));
    const events = [];
    const alerts = [];
    const errors = [];
    const bib = join(directory, "közös.bib");
    const docs = [join(directory, "a-main.lyx"), join(directory, "b-gyermek.lyx")];
    const unrelated = join(directory, "unrelated.lyx");
    const originalBib = bytes("\uFEFF1_A 1_B\n@article{a,\n title={Original A}\n}\n@book{b,\n title={Original B}\n}\n");
    const originals = new Map([
        [bib, originalBib], [docs[0], bytes("\uFEFF" + citation("a,b,external"))],
        [docs[1], bytes(citation("b,a", "\n"))], [unrelated, bytes(citation("a,b"))]
    ]);
    for (const [path, data] of originals) await fsp.writeFile(path, data);
    const database = new DatabaseSync(join(directory, "lyz.sqlite"));
    t.after(async () => {
        database.close();
        await fsp.rm(directory, { recursive: true, force: true });
    });
    const connection = {
        async queryAsync(sql, params = []) {
            const statement = database.prepare(sql);
            return /^\s*(SELECT|PRAGMA)/i.test(sql)
                ? statement.all(...params) : (statement.run(...params), []);
        },
        async executeTransaction(callback) {
            database.exec("BEGIN");
            try {
                await callback();
                if (options.databaseFailure) throw new Error("database commit failed");
                database.exec("COMMIT");
            } catch (error) {
                database.exec("ROLLBACK");
                throw error;
            }
        }
    };
    let active = docs[0];
    let writeCount = 0;
    const context = vm.createContext({
        TextEncoder, TextDecoder,
        PathUtils: {},
        Services: { uuid: { generateUUID: () => "{fixture}" } },
        LyZLocale: { getString: (id, args = {}) => ({ id, ...args }) },
        Zotero: {
            Promise: { coroutine: fn => fn }, debug() {}, logError: error => errors.push(error),
            DBConnection: function() { return connection; },
            Items: { getLibraryKeyHash: item => "1_" + item.key },
            Translate: { Export: class {
                setTranslator() {}
                setDisplayOptions() {}
                setHandler(name, handler) { this.handler = handler; }
                setItems(items) { this.item = items[0]; }
                async translate() {
                    if (options.exportFailure) throw new Error("translator failed");
                    const key = options.unchanged ? this.item.key.toLowerCase()
                        : (this.item.key === "A" ? "b" : "a");
                    this.handler({ string: "@article{" + key + ",\n title={Updated " + this.item.key + "}\n}\n" }, true);
                }
            } }
        },
        IOUtils: {
            read: async path => new Uint8Array(await fsp.readFile(path)),
            async copy(from, to, copyOptions) {
                events.push(["backup", from, to]);
                if (options.backupFailure === from) throw new Error("backup unavailable");
                await fsp.copyFile(from, to, copyOptions.noOverwrite ? fs.constants.COPYFILE_EXCL : 0);
                if (options.corruptBackup === from) await fsp.writeFile(to, "corrupt backup");
            },
            async write(path, data, writeOptions) {
                assert.ok(writeOptions.tmpPath);
                assert.equal(writeOptions.flush, true);
                events.push(["write", path]);
                writeCount++;
                if (options.restoreFailure === path && writeCount > 3) throw new Error("restore failed");
                await fsp.writeFile(writeOptions.tmpPath, data);
                await fsp.rename(writeOptions.tmpPath, path);
                // Simulate rejection after replacing the destination too.
                if (options.writeFailure === path && writeCount <= 3) throw new Error("disk full");
                if (options.changeAfterWrite === path && writeCount === 1) {
                    await fsp.writeFile(docs[1], "external edit");
                }
            },
            remove: path => fsp.rm(path, { force: true })
        },
        LyZServer: {
            async requireCommand(lyz, command) {
                events.push(["lyx", command]);
                if (options.commandFailure === command) throw new Error("LyX rejected " + command);
                if (command.startsWith("file-open:")) {
                    active = command.slice("file-open:".length);
                } else if (command === "server-get-filename") {
                    return active;
                } else if (command === "buffer-close") {
                    if (!options.cancelClose) active = "";
                } else if (command === "buffer-write:force" && options.unsavedEdit && active === docs[0]) {
                    await fsp.appendFile(active, "Unsaved edit preserved\r\n");
                }
                return "";
            }
        }
    });
    for (const name of ["database-service.js", "bibtex-service.js", "key-update-service.js", "lyz.js"]) {
        vm.runInContext(script(name), context);
    }
    const lyz = context.Zotero.Lyz;
    const service = context.LyZKeyUpdate;
    const mappings = context.LyZDatabase;
    await mappings.init(lyz);
    for (const doc of docs) await mappings.addDocument(lyz, doc, bib);
    await mappings.addDocument(lyz, unrelated, "other.bib");
    await mappings.insertKey(lyz, "a", bib, "1_A");
    await mappings.insertKey(lyz, "b", bib, "1_B");
    await mappings.insertKey(lyz, "untouched", "other.bib", "1_A");
    const originalReplace = mappings.replaceKeysForBib.bind(mappings);
    mappings.replaceKeysForBib = async (...args) => {
        events.push(["database"]);
        assert.match(await fsp.readFile(bib, "utf8"), /title=\{Updated A\}/);
        if (!options.unchanged) {
            assert.match(await fsp.readFile(docs[0], "utf8"), /key "b,a,external"/);
            assert.match(await fsp.readFile(docs[1], "utf8"), /key "a,b"/);
        }
        return originalReplace(...args);
    };
    lyz.checkDocInDB = async () => [bib, docs[0]];
    lyz.getZoteroItem = zid => options.missingItem && zid === "1_B"
        ? null : ({ key: zid.slice(2) });
    lyz.os = "Linux";
    lyz.prefs = {
        getCharPref: name => name === "citekey" ? "author year title" : "test-translator",
        getBoolPref: () => false
    };
    lyz.exportToBibtex = (items, path, zids) => context.LyZBibTeX.exportItems(lyz, items, path, zids);
    let confirmations = 0;
    lyz.confirm = () => ++confirmations === 1 || !options.cancelRewrite;
    lyz.alert = (message, title) => alerts.push({ message, title });
    return {
        context, directory, lyz, service, mappings, bib, docs, unrelated, originals,
        events, alerts, errors, database, options,
        keys: () => database.prepare("SELECT zid,key FROM keys WHERE bib=? ORDER BY zid").all(bib)
            .map(row => ({ ...row })),
        async unchangedFiles() {
            for (const [path, original] of originals) {
                assert.deepEqual(new Uint8Array(await fsp.readFile(path)), original);
            }
            assert.deepEqual(this.keys(), [{ zid: "1_A", key: "a" }, { zid: "1_B", key: "b" }]);
        }
    };
}

test("full key update exports, backs up and rewrites every associated document before SQLite commit", async t => {
    const f = await fixture(t);
    assert.equal(await f.lyz.updateBibtexAll(), true);
    assert.deepEqual(f.keys(), [{ zid: "1_A", key: "b" }, { zid: "1_B", key: "a" }]);
    assert.deepEqual(await fsp.readFile(f.unrelated), Buffer.from(f.originals.get(f.unrelated)));
    const backupEvents = f.events.filter(event => event[0] === "backup");
    assert.equal(backupEvents.length, 3);
    for (const [, path, backup] of backupEvents) {
        assert.deepEqual(await fsp.readFile(backup), Buffer.from(f.originals.get(path)));
    }
    const firstWrite = f.events.findIndex(event => event[0] === "write");
    assert.ok(f.events.slice(0, firstWrite).filter(event => event[0] === "backup").length === 3);
    assert.equal(f.events.filter(event => event[0] === "write").length, 3);
    assert.deepEqual(f.events.at(-1), ["lyx", "file-open:" + f.docs[0]]);
    assert.match(await fsp.readFile(f.docs[0], "utf8"), /\uFEFF.*\r\n/);
    assert.match(await fsp.readFile(f.docs[0], "utf8"), /Árvíztűrő/);
    assert.match(await fsp.readFile(f.docs[0], "utf8"), /\\end_inset\r\nkey "a,b"/);
});

test("canceling document rewrite leaves files and mappings untouched", async t => {
    const f = await fixture(t, { cancelRewrite: true });
    assert.equal(await f.lyz.updateBibtexAll(), false);
    await f.unchangedFiles();
    assert.equal(f.events.length, 0);
});

for (const mode of ["exportFailure", "missingItem", "unchanged"]) {
    test(mode + " handles the update without rewriting LyX documents", async t => {
        const f = await fixture(t, { [mode]: true });
        assert.equal(await f.lyz.updateBibtexAll(), mode === "unchanged");
        assert.equal(f.events.filter(event => event[0] === "lyx").length, 0);
        if (mode !== "unchanged") await f.unchangedFiles();
        else for (const doc of f.docs) assert.deepEqual(await fsp.readFile(doc), Buffer.from(f.originals.get(doc)));
    });
}

test("missing associated document aborts before any LyX command or bibliography write", async t => {
    const f = await fixture(t);
    await fsp.unlink(f.docs[1]);
    assert.equal(await f.lyz.updateBibtexAll(), false);
    assert.equal(f.events.length, 0);
    assert.equal(f.alerts.at(-1).message.path, f.docs[1]);
    assert.deepEqual(await fsp.readFile(f.bib), Buffer.from(f.originals.get(f.bib)));
});

for (const failure of ["backupFailure", "corruptBackup", "writeFailure"]) {
    test(failure + " restores all modified files and retains old mappings", async t => {
        const f = await fixture(t);
        f.options[failure] = f.docs[1];
        assert.equal(await f.lyz.updateBibtexAll(), false);
        await f.unchangedFiles();
        assert.equal(f.alerts.at(-1).message.path, f.docs[1]);
        assert.deepEqual(f.events.at(-1), ["lyx", "file-open:" + f.docs[0]]);
    });
}

test("a SQLite commit failure rolls back the key rows and restores bibliography and both documents", async t => {
    const f = await fixture(t);
    f.options.databaseFailure = true;
    assert.equal(await f.lyz.updateBibtexAll(), false);
    await f.unchangedFiles();
    assert.equal(f.errors.at(-1).stage, "database");
});

test("an incomplete restore identifies the file and leaves verified backups for manual recovery", async t => {
    const f = await fixture(t);
    f.options.databaseFailure = true;
    f.options.restoreFailure = f.docs[0];
    assert.equal(await f.lyz.updateBibtexAll(), false);
    assert.match(f.errors.at(-1).rollbackErrors.join("\n"), /a-main\.lyx: Error: restore failed/);
    assert.equal(f.errors.at(-1).backups.length, 3);
    assert.deepEqual(f.keys(), [{ zid: "1_A", key: "a" }, { zid: "1_B", key: "b" }]);
    for (const [, path, backup] of f.events.filter(event => event[0] === "backup")) {
        assert.deepEqual(await fsp.readFile(backup), Buffer.from(f.originals.get(path)));
    }
});

test("LyX save refusal aborts the update before backups, writes or mapping changes", async t => {
    const f = await fixture(t, { commandFailure: "buffer-write:force" });
    assert.equal(await f.lyz.updateBibtexAll(), false);
    await f.unchangedFiles();
    assert.equal(f.events.filter(event => event[0] !== "lyx").length, 0);
});

test("a canceled LyX close is detected even when the command returns an acknowledgement", async t => {
    const f = await fixture(t, { cancelClose: true });
    assert.equal(await f.lyz.updateBibtexAll(), false);
    await f.unchangedFiles();
    assert.match(String(f.errors.at(-1)), /did not close/);
    assert.equal(f.events.filter(event => event[0] !== "lyx").length, 0);
});

test("failure to reopen after commit reports a warning without reverting successful writes", async t => {
    const f = await fixture(t);
    const replace = f.mappings.replaceKeysForBib.bind(f.mappings);
    f.mappings.replaceKeysForBib = async (...args) => {
        await replace(...args);
        f.options.commandFailure = "file-open:" + f.docs[1];
    };
    assert.equal(await f.lyz.updateBibtexAll(), true);
    assert.deepEqual(f.keys(), [{ zid: "1_A", key: "b" }, { zid: "1_B", key: "a" }]);
    assert.equal(f.alerts.at(-1).message.id, "lyz-msg-key-update-reopen-failed");
    assert.equal(f.service.busy, false);
});

test("snapshots include unsaved LyX edits after the acknowledged save", async t => {
    const f = await fixture(t, { unsavedEdit: true });
    assert.equal(await f.lyz.updateBibtexAll(), true);
    assert.match(await fsp.readFile(f.docs[0], "utf8"), /Unsaved edit preserved\r\n/);
    const backup = f.events.find(event => event[0] === "backup" && event[1] === f.docs[0])[2];
    assert.match(await fsp.readFile(backup, "utf8"), /key "a,b,external"/);
    assert.match(await fsp.readFile(backup, "utf8"), /Unsaved edit preserved\r\n/);
});

test("an external edit detected before a document write is preserved while earlier writes roll back", async t => {
    const f = await fixture(t);
    f.options.changeAfterWrite = f.bib;
    assert.equal(await f.lyz.updateBibtexAll(), false);
    assert.equal(await fsp.readFile(f.docs[1], "utf8"), "external edit");
    assert.deepEqual(await fsp.readFile(f.bib), Buffer.from(f.originals.get(f.bib)));
    assert.deepEqual(await fsp.readFile(f.docs[0]), Buffer.from(f.originals.get(f.docs[0])));
    assert.deepEqual(f.keys(), [{ zid: "1_A", key: "a" }, { zid: "1_B", key: "b" }]);
});

test("shared bibliography identifiers are imported only when the full update commits", async t => {
    const f = await fixture(t);
    await f.mappings.deleteKeyForZidAndBib(f.lyz, "1_B", f.bib);
    assert.equal(await f.lyz.updateBibtexAll(), true);
    assert.deepEqual(f.keys(), [{ zid: "1_A", key: "b" }, { zid: "1_B", key: "a" }]);
});

test("ambiguous bibliography headers abort rather than guessing item-to-key associations", async t => {
    const f = await fixture(t);
    await fsp.writeFile(f.bib, "1_A 1_B\n@article{a,}\n");
    assert.equal(await f.lyz.updateBibtexAll(), false);
    assert.equal(f.events.length, 0);
    assert.match(String(f.errors.at(-1)), /Ambiguous/);
});

test("reordered bibliography entries cannot silently assign another item's citation key", async t => {
    const f = await fixture(t);
    await fsp.writeFile(f.bib, "1_A 1_B\n@book{b,}\n@article{a,}\n");
    assert.equal(await f.lyz.updateBibtexAll(), false);
    assert.equal(f.events.length, 0);
    assert.match(String(f.errors.at(-1)), /entry order/);
});

test("rewriting citation tokens handles cycles, substrings and literal replacement characters", async t => {
    const f = await fixture(t);
    const original = bytes(citation("a, aa, b, outside"));
    const rewritten = f.service.rewriteDocument(original, { a: "A", aa: "AA", b: "B" },
        { A: "b", AA: "$&", B: "a" });
    assert.match(new TextDecoder().decode(rewritten), /key "b, \$&, a, outside"/);
    assert.match(new TextDecoder().decode(rewritten), /\\end_inset\r\nkey "a,b"/);
});

test("Windows filename verification accepts LyX forward slashes and case differences", async t => {
    const f = await fixture(t);
    assert.equal(f.service.normalizePath("C:\\Docs\\Main.lyx", "Win"),
        f.service.normalizePath("c:/docs/main.lyx", "Win"));
});

test("new and changed update messages have matching variables in all three languages", () => {
    const ids = ["lyz-msg-confirm-update-lyx-docs", "lyz-msg-key-update-title",
        "lyz-msg-key-update-missing-item", "lyz-msg-key-update-rolled-back",
        "lyz-msg-key-update-failed", "lyz-msg-key-update-reopen-failed"];
    const variables = {};
    for (const locale of ["en-US", "de-DE", "hu-HU"]) {
        const text = fs.readFileSync(join(root, "addon/locale", locale, "lyz.ftl"), "utf8");
        for (const id of ids) {
            const match = new RegExp("^" + id + " =([^]*?)(?=^[a-z]|^##|$(?![^]))", "m").exec(text);
            assert.ok(match, locale + ": " + id);
            const names = [...match[1].matchAll(/\$([A-Za-z][A-Za-z0-9-]*)/g)].map(part => part[1]).sort();
            if (locale === "en-US") variables[id] = names;
            else assert.deepEqual(names, variables[id], locale + ": " + id);
        }
    }
});
