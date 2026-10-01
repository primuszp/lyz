"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { join, resolve, isAbsolute } = require("node:path");
const { tmpdir } = require("node:os");
const { DatabaseSync } = require("node:sqlite");
const vm = require("node:vm");
const { createHash } = require("node:crypto");

const root = resolve(__dirname, "../..");
const script = name => fs.readFileSync(join(root, "addon/chrome/content/lyz", name), "utf8");
const bytes = text => new TextEncoder().encode(text);
const citation = (keys, newline = "\r\n") => [
    "#LyX 2.5 created this file", "\\begin_document", "Árvíztűrő tükörfúrógép",
    "\\begin_inset CommandInset citation", 'LatexCommand citep', 'key "' + keys + '"',
    "\\end_inset", 'key "a,b"', "\\end_document", ""
].join(newline);

async function fixture(t, options = {}) {
    const directory = options.directory || await fsp.mkdtemp(join(tmpdir(), "lyz-key-update-"));
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
    if (!options.reopen) for (const [path, data] of originals) await fsp.writeFile(path, data);
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
                const committed = database.prepare("SELECT state FROM key_updates").get()?.state === "committed";
                if (options.databaseFailure && committed) throw new Error("database commit failed");
                if (options.beforeCommit) options.beforeCommit(committed);
                database.exec("COMMIT");
                if (options.afterCommit) options.afterCommit(committed);
            } catch (error) {
                database.exec("ROLLBACK");
                throw error;
            }
        }
    };
    let active = docs[0];
    let writeCount = 0;
    const context = vm.createContext({
        TextEncoder, TextDecoder, setTimeout,
        PathUtils: { normalize: path => fs.realpathSync(path), isAbsolute },
        Services: { uuid: { generateUUID: () => "{fixture}" } },
        Components: {
            interfaces: {},
            classes: { "@mozilla.org/security/hash;1": { createInstance: () => ({
                SHA256: 4,
                init(type) { assert.equal(type, 4); this.hash = createHash("sha256"); },
                update(data, count) { assert.equal(count, data.length); this.hash.update(Buffer.from(data)); },
                finish(ascii) { assert.equal(ascii, false); return this.hash.digest("latin1"); }
            }) } }
        },
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
            async stat(path) {
                try {
                    const info = await fsp.stat(path);
                    return { type: info.isFile() ? "regular" : "directory" };
                } catch (error) {
                    if (error.code === "ENOENT") error.name = "NotFoundError";
                    throw error;
                }
            },
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
                if (options.afterWrite) options.afterWrite(writeCount, path);
            },
            remove: path => fsp.rm(path, { force: true })
        },
        LyZServer: {
            async requireCommand(lyz, command) {
                events.push(["lyx", command]);
                if (options.commandFailure === command) throw new Error("LyX rejected " + command);
                if (command === "buffer-switch:" + options.closedDocument) {
                    throw new Error("LyX command failed (ERROR:fixture:buffer-switch:Buffer is not open)");
                }
                if (command.startsWith("file-open:") || command.startsWith("buffer-switch:")) {
                    active = command.slice(command.indexOf(":") + 1);
                    if (active === options.closedDocument) options.closedDocument = null;
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
    for (const name of ["file-service.js", "database-service.js", "bibtex-service.js", "key-update-service.js", "lyz.js"]) {
        vm.runInContext(script(name), context);
    }
    const lyz = context.Zotero.Lyz;
    const service = context.LyZKeyUpdate;
    const mappings = context.LyZDatabase;
    await mappings.init(lyz);
    if (!options.reopen) {
        for (const doc of docs) await mappings.addDocument(lyz, doc, bib);
        await mappings.addDocument(lyz, unrelated, "other.bib");
        await mappings.insertKey(lyz, "a", bib, "1_A");
        await mappings.insertKey(lyz, "b", bib, "1_B");
        await mappings.insertKey(lyz, "untouched", "other.bib", "1_A");
    }
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
    lyz.confirm = message => {
        if (message.id === "lyz-msg-recovery-confirm") {
            if (options.onRecoveryConfirm) options.onRecoveryConfirm();
            return !options.cancelRecovery;
        }
        return ++confirmations === 1 || !options.cancelRewrite;
    };
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


module.exports = { fixture, bytes, citation };
