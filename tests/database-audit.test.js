"use strict";

const assert = require("node:assert/strict");
const { readFileSync, realpathSync, existsSync, mkdtempSync } = require("node:fs");
const fsp = require("node:fs/promises");
const { resolve, join, dirname, basename, isAbsolute } = require("node:path");
const { tmpdir } = require("node:os");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const vm = require("node:vm");

const root = resolve(__dirname, "..");
const plain = value => JSON.parse(JSON.stringify(value));
const legacySchema = "CREATE TABLE docs (id INTEGER PRIMARY KEY, doc TEXT, bib TEXT); " +
    "CREATE TABLE keys (id INTEGER PRIMARY KEY, key TEXT, bib TEXT, zid TEXT);";

function fixture(t, options = {}) {
    const db = new DatabaseSync(":memory:");
    t.after(() => db.close());
    if (options.sql) db.exec(options.sql);
    const queries = [];
    const errors = [];
    const connection = {
        path: "C:/data/lyz.sqlite",
        async queryAsync(sql, params = []) {
            queries.push(sql);
            if (options.failSQL && sql.includes(options.failSQL)) throw new Error("injected query failure");
            if (options.integrity && sql.startsWith("PRAGMA integrity_check")) {
                return options.integrity.map(integrity_check => ({ integrity_check }));
            }
            const statement = db.prepare(sql);
            const rows = /^(SELECT|PRAGMA)/i.test(sql) ? statement.all(...params) : (statement.run(...params), []);
            // Zotero DB rows expose column access but cannot be spread or serialized.
            return rows.map(row => new Proxy({}, {
                get(_target, field) {
                    if (!(field in row)) throw new Error("DB column not found: " + String(field));
                    return row[field];
                }
            }));
        },
        async executeTransaction(callback) {
            if (options.failBegin) throw new Error("BEGIN failed");
            db.exec("BEGIN");
            try {
                const result = await callback();
                if (options.failCommit) throw new Error("COMMIT failed");
                db.exec("COMMIT");
                return result;
            } catch (error) { db.exec("ROLLBACK"); throw error; }
        },
        async closeDatabase() {}
    };
    const context = vm.createContext({
        TextEncoder,
        PathUtils: { normalize: path => {
            if (!existsSync(path)) throw new Error("path does not exist");
            return realpathSync(path);
        }, parent: dirname, filename: basename, join, isAbsolute },
        Services: { uuid: { generateUUID: () => "{fixture}" } },
        LyZLocale: { getString: (id, args = {}) => ({ id, ...args }) },
        Zotero: { DBConnection: function() { return connection; }, logError: error => errors.push(error),
            Promise: { coroutine: fn => fn } },
        IOUtils: {
            async write(path, bytes, settings) {
                assert.equal(settings.flush, true);
                await fsp.writeFile(settings.tmpPath, bytes);
                if (options.failWrite) throw new Error("diagnostics write failed");
                await fsp.rename(settings.tmpPath, path);
            },
            remove: path => fsp.rm(path, { force: true })
        }
    });
    for (const file of ["file-service.js", "database-service.js", "diagnostics-service.js", "lyz.js"]) {
        vm.runInContext(readFileSync(join(root, "addon/chrome/content/lyz", file), "utf8"), context);
    }
    const lyz = context.Zotero.Lyz;
    lyz.os = "Win";
    lyz.wm = { getMostRecentWindow: () => ({}) };
    return { context, db, connection, lyz, service: context.LyZDatabase,
        diagnostics: context.LyZDiagnostics, queries, errors, options };
}

function snapshot(db) {
    return {
        version: db.prepare("PRAGMA user_version").get().user_version,
        schema: db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all().map(row => ({ ...row })),
        docs: db.prepare("SELECT * FROM docs ORDER BY id").all().map(row => ({ ...row })),
        keys: db.prepare("SELECT * FROM keys ORDER BY id").all().map(row => ({ ...row }))
    };
}

test("a new database is versioned and later starts audit without schema writes", async t => {
    const f = fixture(t);
    assert.equal(await f.service.init(f.lyz), true);
    assert.equal(f.db.prepare("PRAGMA user_version").get().user_version, 1);
    assert.equal(f.lyz.databaseBlocked, false);
    const first = snapshot(f.db);
    f.queries.length = 0;
    assert.equal(await f.service.init(f.lyz), true);
    assert.deepEqual(snapshot(f.db), first);
    assert.ok(f.queries.every(sql => /^SELECT/.test(sql) || /^PRAGMA/.test(sql) && !sql.includes(" = ")));
    assert.deepEqual(plain(f.lyz.databaseStatus.integrity), ["ok"]);
});

test("legacy consolidation retains full duplicate rows in the same transaction", async t => {
    const f = fixture(t, { sql: legacySchema +
        "INSERT INTO docs VALUES(1,'közös.lyx','old.bib'),(2,'közös.lyx','new.bib'); " +
        "INSERT INTO keys VALUES(3,'old-key','new.bib','1_A'),(4,'new-key','new.bib','1_A');" });
    assert.equal(await f.service.init(f.lyz), true);
    assert.equal(f.db.prepare("SELECT bib FROM docs").get().bib, "new.bib");
    assert.equal(f.db.prepare("SELECT key FROM keys").get().key, "new-key");
    const archived = f.db.prepare("SELECT source,record FROM migration_records ORDER BY id").all();
    assert.deepEqual(archived.map(row => ({ source: row.source, record: JSON.parse(row.record) })), [
        { source: "docs", record: { id: 1, doc: "közös.lyx", bib: "old.bib" } },
        { source: "keys", record: { id: 3, key: "old-key", bib: "new.bib", zid: "1_A" } }
    ]);
    assert.equal(await f.service.init(f.lyz), true);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM migration_records").get().count, 2);
});

test("a failed migration rolls back the version, schema, archives and duplicate consolidation", async t => {
    const f = fixture(t, { sql: legacySchema + "INSERT INTO docs VALUES(1,'d','b'),(2,'d','b2');", failCommit: true });
    const before = snapshot(f.db);
    assert.equal(await f.service.init(f.lyz), false);
    assert.equal(f.lyz.databaseBlocked, true);
    assert.deepEqual(snapshot(f.db), before);
    f.options.failCommit = false;
    assert.equal(await f.service.init(f.lyz), true);
});

test("a reported read-only connection prevents migration before files can be changed", async t => {
    const f = fixture(t, { sql: legacySchema + "INSERT INTO docs VALUES(1,'d','b');" });
    f.connection.readOnly = true;
    const before = snapshot(f.db);
    assert.equal(await f.service.init(f.lyz), false);
    assert.match(f.lyz.databaseStatus.error, /read-only/);
    assert.deepEqual(snapshot(f.db), before);
});

test("a real non-SQLite database file is preserved and can produce a partial diagnostic report", async t => {
    const f = fixture(t);
    const dir = mkdtempSync(join(tmpdir(), "lyz-corrupt-database-"));
    const path = join(dir, "lyz.sqlite");
    const original = Buffer.from("This is not a SQLite database. Keep the original evidence.");
    await fsp.writeFile(path, original);
    let damagedDB;
    t.after(async () => {
        if (damagedDB) damagedDB.close();
        await fsp.rm(dir, { recursive: true, force: true });
    });
    f.context.Zotero.DBConnection = function() {
        return {
            path,
            async queryAsync(sql) {
                if (!damagedDB) damagedDB = new DatabaseSync(path);
                return damagedDB.prepare(sql).all();
            },
            async executeTransaction(callback) {
                await this.queryAsync("BEGIN");
                return callback();
            }
        };
    };
    assert.equal(await f.service.init(f.lyz), false);
    const report = plain(await f.diagnostics.collect(f.lyz));
    assert.equal(report.databaseBlocked, true);
    assert.equal(report.databasePath, path);
    assert.ok(report.errors.some(error => error.section === "integrity"));
    assert.deepEqual(await fsp.readFile(path), original);
});

test("startup reports a database failure once and skips file recovery and legacy migration", async t => {
    const f = fixture(t, { sql: legacySchema + "PRAGMA user_version = 99;" });
    const messages = [];
    f.context.Zotero.Schema = { schemaUpdatePromise: Promise.resolve() };
    f.context.Services.prefs = { getBranch: () => ({ getBoolPref: () => true }) };
    f.context.Services.obs = { addObserver() {} };
    f.context.Components = { classes: {
        "@mozilla.org/appshell/window-mediator;1": { getService: () => ({}) }
    }, interfaces: {} };
    f.context.LyZKeyUpdate = { recoverPending: () => { throw new Error("must not recover"); } };
    f.lyz.setDefaultPrefs = () => {};
    f.lyz.migrateToZotero5 = () => { throw new Error("must not migrate"); };
    f.lyz.alert = (message, title) => messages.push({ message, title });
    const first = f.lyz.init();
    const second = f.lyz.init();
    assert.equal(first, second);
    await Promise.all([first, second]);
    assert.equal(f.lyz.initialized, true);
    assert.equal(f.lyz.databaseBlocked, true);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].message.id, "lyz-msg-database-blocked");
    await f.lyz.init();
    assert.equal(messages.length, 1);
});

test("an unexpected legacy table is rejected before creating or deleting anything", async t => {
    const f = fixture(t, { sql: "CREATE TABLE docs (id INTEGER PRIMARY KEY, doc TEXT, bib TEXT, extra TEXT);" });
    const before = f.db.prepare("SELECT sql FROM sqlite_master").all();
    assert.equal(await f.service.init(f.lyz), false);
    assert.match(f.lyz.databaseStatus.error, /Unexpected columns/);
    assert.deepEqual(f.db.prepare("SELECT sql FROM sqlite_master").all(), before);
});

test("future schema versions block writes without modifying mappings or schema", async t => {
    const f = fixture(t, { sql: legacySchema + "PRAGMA user_version = 99; INSERT INTO docs VALUES(1,'d','b');" });
    const before = snapshot(f.db);
    assert.equal(await f.service.init(f.lyz), false);
    assert.match(f.lyz.databaseStatus.error, /version: 99/);
    await assert.rejects(f.service.addDocument(f.lyz, "new", "new"), /blocked/);
    await assert.rejects(f.service.deleteBib(f.lyz, "b"), /blocked/);
    await assert.rejects(f.lyz.checkAndCite(), /blocked/);
    await assert.rejects(f.lyz.updateBibtexAll(), /blocked/);
    assert.throws(() => f.lyz.writeBib("b", "content", []), /blocked/);
    assert.deepEqual(snapshot(f.db), before);
});

for (const sql of [
    "INSERT INTO docs VALUES(1,NULL,'b');", "INSERT INTO keys VALUES(1,'k','b','');"
]) test("invalid legacy mappings are retained for diagnosis: " + sql, async t => {
    const f = fixture(t, { sql: legacySchema + sql });
    const before = snapshot(f.db);
    assert.equal(await f.service.init(f.lyz), false);
    assert.match(f.lyz.databaseStatus.error, /Invalid mapping/);
    assert.deepEqual(snapshot(f.db), before);
});

for (const problem of [
    { integrity: ["row 1 missing from index docs_doc_unique"] }, { failSQL: "integrity_check" }
]) test("a failed SQLite integrity check prevents all migration writes: " + JSON.stringify(problem), async t => {
    const f = fixture(t, { sql: legacySchema + "INSERT INTO docs VALUES(1,'d','b');", ...problem });
    const before = snapshot(f.db);
    assert.equal(await f.service.init(f.lyz), false);
    assert.equal(f.lyz.databaseStatus.stage, "integrity");
    assert.deepEqual(snapshot(f.db), before);
    assert.ok(f.queries.every(sql => /^PRAGMA integrity_check/.test(sql)));
});

test("a versioned database with a missing or incorrect index is not silently repaired", async t => {
    for (const replacement of ["", "CREATE INDEX docs_doc_unique ON docs(bib);",
        "CREATE UNIQUE INDEX docs_doc_unique ON docs(doc COLLATE NOCASE);"]) {
        const f = fixture(t);
        await f.service.init(f.lyz);
        f.db.exec("DROP INDEX docs_doc_unique; " + replacement);
        const before = snapshot(f.db);
        assert.equal(await f.service.init(f.lyz), false);
        assert.match(f.lyz.databaseStatus.error, /invalid index/);
        assert.deepEqual(snapshot(f.db), before);
    }
});

test("pending recovery journals survive version adoption unchanged", async t => {
    const f = fixture(t);
    await f.service.init(f.lyz);
    f.db.exec("PRAGMA user_version = 0; DROP TABLE migration_records; " +
        "INSERT INTO key_updates VALUES('lyz-1','b','prepared','unparsed journal');");
    assert.equal(await f.service.init(f.lyz), true);
    assert.equal(f.db.prepare("SELECT journal FROM key_updates").get().journal, "unparsed journal");
});

test("duplicate consolidation cannot invalidate a pending recovery snapshot", async t => {
    const f = fixture(t);
    await f.service.init(f.lyz);
    f.db.exec("PRAGMA user_version = 0; DROP INDEX docs_doc_unique; " +
        "INSERT INTO docs VALUES(1,'d','b'),(2,'d','different'); " +
        "INSERT INTO key_updates VALUES('lyz-1','b','prepared','journal');");
    const before = snapshot(f.db);
    assert.equal(await f.service.init(f.lyz), false);
    assert.match(f.lyz.databaseStatus.error, /Pending key update/);
    assert.deepEqual(snapshot(f.db), before);
});

test("unknown triggers and incorrectly defined legacy indexes cannot cause destructive migration", async t => {
    for (const change of ["CREATE TRIGGER remove_key AFTER DELETE ON docs BEGIN DELETE FROM keys; END;",
        "CREATE INDEX keys_bib_zid_unique ON keys(key);"]) {
        const f = fixture(t, { sql: legacySchema + change });
        const before = snapshot(f.db);
        assert.equal(await f.service.init(f.lyz), false);
        assert.deepEqual(snapshot(f.db), before);
    }
});

test("diagnostics serialize real Zotero-style proxy rows including archives and raw journals", async t => {
    const f = fixture(t, { sql: legacySchema + "INSERT INTO docs VALUES(1,'d','old'),(2,'d','b');" });
    await f.service.init(f.lyz);
    f.db.exec("INSERT INTO keys VALUES(1,'key','b','1_A'); " +
        "INSERT INTO key_updates VALUES('lyz-1','b','prepared','invalid JSON retained');");
    f.lyz.recoveryRequired = true;
    const before = snapshot(f.db);
    const report = plain(await f.diagnostics.collect(f.lyz));
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.databaseBlocked, false);
    assert.equal(report.recoveryRequired, true);
    assert.equal(report.tables.docs.rows[0].bib, "b");
    assert.equal(report.tables.keys.rows[0].zid, "1_A");
    assert.equal(report.tables.key_updates.rows[0].journal, "invalid JSON retained");
    assert.equal(JSON.parse(report.tables.migration_records.rows[0].record).bib, "old");
    assert.equal(report.errors.length, 0);
    assert.deepEqual(snapshot(f.db), before);
});

test("diagnostics remain exportable after unknown-schema, partial-read and BEGIN failures", async t => {
    const f = fixture(t, { sql: legacySchema + "PRAGMA user_version = 99; INSERT INTO docs VALUES(1,'d','b');" });
    await f.service.init(f.lyz);
    f.options.failSQL = "SELECT * FROM keys";
    f.options.failBegin = true;
    const report = plain(await f.diagnostics.collect(f.lyz));
    assert.equal(report.databaseBlocked, true);
    assert.equal(report.schemaVersion, 99);
    assert.equal(report.tables.docs.rows[0].doc, "d");
    assert.equal(report.tables.keys.rows, null);
    assert.ok(report.errors.some(error => error.section === "snapshot"));
    assert.ok(report.errors.some(error => error.section === "keys"));
    f.options.failSQL = "table_xinfo(docs)";
    const unreadableColumns = plain(await f.diagnostics.collect(f.lyz));
    assert.equal(unreadableColumns.tables.docs.columns, null);
    assert.equal(unreadableColumns.tables.docs.rows, null);
});

test("unexpected columns are included in diagnostic exports instead of being discarded", async t => {
    for (const schema of ["CREATE TABLE docs(id INTEGER, doc TEXT, extra TEXT); INSERT INTO docs VALUES(1,'d','evidence');",
        "CREATE TABLE docs(id INTEGER PRIMARY KEY, doc TEXT, bib TEXT, extra TEXT GENERATED ALWAYS AS ('evidence') VIRTUAL); " +
        "INSERT INTO docs(id,doc,bib) VALUES(1,'d','b');"]) {
        const f = fixture(t, { sql: schema });
        await f.service.init(f.lyz);
        const report = plain(await f.diagnostics.collect(f.lyz));
        assert.equal(report.tables.docs.rows[0].extra, "evidence");
        assert.ok(report.errors.length > 0);
    }
});

test("diagnostics support a failed connection without retrying a migration", async t => {
    const f = fixture(t);
    f.lyz.DB = null;
    const report = plain(await f.diagnostics.collect(f.lyz));
    assert.equal(report.errors[0].section, "connection");
    assert.equal(f.queries.length, 0);
});

test("JSON export works for a new Unix filename and failed writes preserve the previous report", async t => {
    const f = fixture(t);
    await f.service.init(f.lyz);
    f.lyz.os = "Linux";
    const dir = mkdtempSync(join(tmpdir(), "lyz-diagnostics-"));
    t.after(() => fsp.rm(dir, { recursive: true, force: true }));
    const path = join(dir, "árvíztűrő.json");
    const report = await f.diagnostics.collect(f.lyz);
    await f.diagnostics.exportReport(f.lyz, path, report);
    assert.equal(JSON.parse(await fsp.readFile(path, "utf8")).format, "lyz-database-diagnostics");
    const saved = await fsp.readFile(path);
    f.options.failWrite = true;
    await assert.rejects(f.diagnostics.exportReport(f.lyz, path, report), /write failed/);
    assert.deepEqual(await fsp.readFile(path), saved);
    assert.deepEqual(await fsp.readdir(dir), ["árvíztűrő.json"]);
});

test("diagnostics cannot overwrite document, database or recovery files", async t => {
    const f = fixture(t);
    const report = { databasePath: "C:/Data/database.json", tables: {
        docs: { rows: [{ doc: "C:/Docs/document.json", bib: "C:/Docs/library.json" }] },
        key_updates: { rows: [{ bib: "C:/Docs/library.json", journal: JSON.stringify({ files: [
            { path: "C:/Docs/document.json", backup: "C:/Docs/backup.json", tmp: "C:/Docs/staging.json" }
        ] }) }] }
    } };
    for (const path of ["C:\\DOCS\\document.json", "C:/Docs/library.json", "C:/Docs/backup.json",
        "C:/Docs/staging.json", "c:/data/DATABASE.json", "C:/Docs/library.bib", "relative.json"]) {
        await assert.rejects(f.diagnostics.exportReport(f.lyz, path, report), /overwrite|\.json|absolute/);
    }
});

test("diagnostic picker cancellation does not read or write the database", async t => {
    const f = fixture(t);
    const picker = { modeSave: 1, returnCancel: 1, returnOK: 0, returnReplace: 2,
        init() {}, appendFilter() {}, show: async () => 1 };
    f.lyz.getFilePicker = async () => [false, picker];
    assert.equal(await f.lyz.databaseDiagnostics(), false);
    assert.equal(f.queries.length, 0);
});

test("diagnostic picker accepts acknowledged replacement without changing the selected filename", async t => {
    const f = fixture(t);
    const messages = [];
    const dir = mkdtempSync(join(tmpdir(), "lyz-diagnostics-ui-"));
    t.after(() => fsp.rm(dir, { recursive: true, force: true }));
    const path = join(dir, "report.json");
    await f.service.init(f.lyz);
    const picker = { modeSave: 1, returnOK: 0, returnReplace: 2, file: path,
        init() {}, appendFilter() {}, show: async () => 2 };
    f.lyz.getFilePicker = async () => [false, picker];
    f.lyz.alert = text => messages.push(text);
    assert.equal(await f.lyz.databaseDiagnostics(), true);
    assert.equal(messages[0].path, path);
    picker.file = join(dir, "wrong.bib");
    assert.equal(await f.lyz.databaseDiagnostics(), false);
    assert.equal(messages.at(-1).id, "lyz-msg-diagnostics-failed");
    assert.deepEqual(await fsp.readdir(dir), ["report.json"]);
});

test("diagnostic export is reachable through MenuManager, toolbar and fallback menus", async t => {
    const f = fixture(t);
    const commands = [];
    f.context.Components = { classes: {}, interfaces: {} };
    f.context.LyZLocale.getAttribute = id => id;
    for (const path of ["addon/bootstrap.js", "addon/chrome/content/lyz/bootstrap-ui.js"]) {
        vm.runInContext(readFileSync(join(root, path), "utf8"), f.context);
    }
    const bootstrap = f.context.LyZBootstrap;
    bootstrap.runCommand = command => commands.push(command);
    bootstrap.runCommandSync = bootstrap.runCommand;
    for (const item of bootstrap.getMenuItems()) item.onCommand();
    const ui = f.context.LyZBootstrapUI;
    ui.createXULElement = () => ({});
    ui.appendMenuItem = (_doc, _parent, _id, _label, callback) => callback();
    const popup = { appendChild() {} };
    ui.appendToolbarCommandItems({}, popup, bootstrap);
    ui.appendLyzCommandItems({}, popup, "tools", bootstrap);
    assert.equal(commands.filter(command => command === "databaseDiagnostics").length, 3);
});

test("database check and diagnostic messages have matching variables in all languages", () => {
    const ids = ["lyz-diagnostics-label", "lyz-msg-database-title", "lyz-msg-database-blocked",
        "lyz-msg-diagnostics-title", "lyz-msg-diagnostics-saved", "lyz-msg-diagnostics-failed"];
    const variables = {};
    for (const locale of ["en-US", "de-DE", "hu-HU"]) {
        const text = readFileSync(join(root, "addon/locale", locale, "lyz.ftl"), "utf8");
        for (const id of ids) {
            const match = new RegExp("^" + id + " =([^]*?)(?=^[a-z]|^##|$(?![^]))", "m").exec(text);
            assert.ok(match, locale + ": " + id);
            const names = [...match[1].matchAll(/\$([A-Za-z][A-Za-z0-9-]*)/g)].map(part => part[1]).sort();
            if (locale === "en-US") variables[id] = names;
            else assert.deepEqual(names, variables[id], locale + ": " + id);
        }
    }
});
