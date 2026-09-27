"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const test = require("node:test");
const { fixture } = require("./helpers/key-update-fixture");

async function crashed(t, checkpoint, options = {}) {
    const directory = await fsp.mkdtemp(join(tmpdir(), "lyz-recovery-"));
    const child = spawnSync(process.execPath,
        [join(__dirname, "helpers/key-update-crash-worker.js"), directory, checkpoint],
        { encoding: "utf8", timeout: 10000 });
    if (child.status !== 73) await fsp.rm(directory, { recursive: true, force: true });
    assert.equal(child.status, 73, child.stdout + child.stderr + (child.error || ""));
    return fixture(t, { directory, reopen: true, ...options });
}

const journals = f => f.database.prepare("SELECT * FROM key_updates").all();
const pending = f => JSON.parse(journals(f)[0].journal);

for (const checkpoint of ["prepared", "staged", "write-1", "write-2", "write-3", "before-commit"]) {
    test("a real process exit at " + checkpoint + " recovers the original files and mappings", async t => {
        const f = await crashed(t, checkpoint);
        assert.equal(journals(f)[0].state, "prepared");
        assert.equal(await f.service.recoverPending(f.lyz), true);
        await f.unchangedFiles();
        assert.equal(journals(f).length, 0);
        assert.equal(f.lyz.recoveryRequired, false);
        assert.equal(f.service.busy, false);
        if (checkpoint === "staged") {
            assert.equal((await fsp.readdir(f.directory)).filter(name => name.endsWith(".tmp")).length, 0);
        }
    });
}

test("exit after SQLite commit preserves the completed update and clears its commit marker", async t => {
    const f = await crashed(t, "committed");
    assert.equal(journals(f)[0].state, "committed");
    assert.equal(await f.service.recoverPending(f.lyz), true);
    assert.deepEqual(f.keys(), [{ zid: "1_A", key: "b" }, { zid: "1_B", key: "a" }]);
    assert.match(await fsp.readFile(f.docs[0], "utf8"), /key "b,a,external"/);
    assert.equal(f.events.filter(event => event[0] === "write").length, 0);
    assert.equal(f.alerts.length, 0);
    assert.equal(journals(f).length, 0);
});

test("declining recovery retains the journal, files and old mappings and blocks further updates", async t => {
    const f = await crashed(t, "write-2", { cancelRecovery: true });
    const before = await fsp.readFile(f.bib);
    assert.equal(await f.service.recoverPending(f.lyz), false);
    assert.equal(f.lyz.recoveryRequired, true);
    assert.equal(await f.lyz.updateBibtexAll(), false);
    assert.deepEqual(await fsp.readFile(f.bib), before);
    assert.equal(journals(f).length, 1);
    assert.equal(f.events.filter(event => event[0] === "write").length, 0);
    assert.deepEqual(f.keys(), [{ zid: "1_A", key: "a" }, { zid: "1_B", key: "b" }]);
});

test("an external edit prevents recovery of the entire set before any file is written", async t => {
    const f = await crashed(t, "write-3");
    const bib = await fsp.readFile(f.bib);
    await fsp.writeFile(f.docs[1], "New user edit after the interruption");
    assert.equal(await f.service.recoverPending(f.lyz), false);
    assert.deepEqual(await fsp.readFile(f.bib), bib);
    assert.equal(await fsp.readFile(f.docs[1], "utf8"), "New user edit after the interruption");
    assert.equal(f.events.filter(event => event[0] === "write").length, 0);
    assert.equal(f.alerts.at(-1).message.path, f.docs[1]);
    assert.equal(journals(f).length, 1);
});

test("a damaged recovery backup is rejected before restoring even the bibliography", async t => {
    const f = await crashed(t, "write-3");
    const journal = pending(f);
    await fsp.writeFile(journal.files[2].backup, "damaged");
    assert.equal(await f.service.recoverPending(f.lyz), false);
    assert.equal(f.events.filter(event => event[0] === "write").length, 0);
    assert.match(String(f.errors.at(-1)), /backup verification failed/);
    assert.equal(journals(f).length, 1);
});

test("a file edited while the recovery prompt is open is preserved", async t => {
    const f = await crashed(t, "write-2");
    f.options.onRecoveryConfirm = () => fs.writeFileSync(f.docs[0], "Edit during confirmation");
    assert.equal(await f.service.recoverPending(f.lyz), false);
    assert.equal(await fsp.readFile(f.docs[0], "utf8"), "Edit during confirmation");
    assert.equal(f.events.filter(event => event[0] === "write").length, 0);
    assert.equal(journals(f).length, 1);
});

test("interrupted recovery is idempotent and resumes from the remaining changed files", async t => {
    const f = await crashed(t, "write-3");
    const write = f.context.IOUtils.write;
    let count = 0;
    f.context.IOUtils.write = async (...args) => {
        if (++count === 2) throw new Error("Recovery disk error");
        return write(...args);
    };
    assert.equal(await f.service.recoverPending(f.lyz), false);
    assert.equal(journals(f).length, 1);
    f.context.IOUtils.write = write;
    assert.equal(await f.service.recoverPending(f.lyz), true);
    await f.unchangedFiles();
    assert.equal(journals(f).length, 0);
});

test("committed files with external edits are retained and their mappings are not reverted", async t => {
    const f = await crashed(t, "committed");
    await fsp.appendFile(f.docs[0], "External edit");
    assert.equal(await f.service.recoverPending(f.lyz), false);
    assert.deepEqual(f.keys(), [{ zid: "1_A", key: "b" }, { zid: "1_B", key: "a" }]);
    assert.equal(f.events.filter(event => event[0] === "write").length, 0);
    assert.equal(journals(f)[0].state, "committed");
});

test("mapping changes made after interruption are detected without altering files", async t => {
    const f = await crashed(t, "write-2");
    await f.mappings.updateKey(f.lyz, "external-key", "1_A", f.bib);
    assert.equal(await f.service.recoverPending(f.lyz), false);
    assert.match(String(f.errors.at(-1)), /Mappings changed/);
    assert.equal(f.events.filter(event => event[0] === "write").length, 0);
});

for (const defect of ["invalid-json", "unknown-version", "foreign-backup"]) {
    test(defect + " journal blocks recovery without touching file paths", async t => {
        const f = await crashed(t, "write-1");
        const journal = pending(f);
        if (defect === "unknown-version") journal.version = 99;
        if (defect === "foreign-backup") journal.files[0].backup = f.docs[0];
        f.database.prepare("UPDATE key_updates SET journal=?").run(
            defect === "invalid-json" ? "{" : JSON.stringify(journal));
        assert.equal(await f.service.recoverPending(f.lyz), false);
        assert.equal(f.lyz.recoveryRequired, true);
        assert.equal(f.events.filter(event => event[0] === "write").length, 0);
        assert.equal(journals(f).length, 1);
    });
}

test("startup runs recovery before migration and blocks migration if recovery is declined", async t => {
    const f = await crashed(t, "write-2", { cancelRecovery: true });
    const events = [];
    f.context.Zotero.Schema = { schemaUpdatePromise: Promise.resolve() };
    f.context.Services.prefs = { getBranch: () => ({ getBoolPref: () => true }) };
    f.context.Services.obs = { addObserver() {} };
    f.context.Components.classes["@mozilla.org/appshell/window-mediator;1"] = { getService: () => ({}) };
    f.lyz.setDefaultPrefs = () => {};
    f.lyz.migrateToZotero5 = async () => events.push("migration");
    await f.lyz.init();
    assert.equal(f.lyz.initialized, true);
    assert.equal(f.lyz.recoveryRequired, true);
    assert.deepEqual(events, []);
    assert.equal(journals(f).length, 1);
});

test("normal success retires its journal; a failed live restore retains it for startup recovery", async t => {
    const f = await fixture(t);
    f.options.databaseFailure = true;
    f.options.restoreFailure = f.docs[0];
    assert.equal(await f.lyz.updateBibtexAll(), false);
    assert.equal(journals(f).length, 1);
    assert.equal(f.lyz.recoveryRequired, true);
    f.options.databaseFailure = false;
    f.options.restoreFailure = null;
    assert.equal(await f.service.recoverPending(f.lyz), true);
    await f.unchangedFiles();
    assert.equal(journals(f).length, 0);
});

test("a journal cleanup failure after commit never rolls back the successful files", async t => {
    const f = await fixture(t);
    const finish = f.mappings.finishKeyUpdate.bind(f.mappings);
    f.mappings.finishKeyUpdate = async () => { throw new Error("journal cleanup failed"); };
    assert.equal(await f.lyz.updateBibtexAll(), true);
    assert.equal(journals(f)[0].state, "committed");
    assert.deepEqual(f.keys(), [{ zid: "1_A", key: "b" }, { zid: "1_B", key: "a" }]);
    assert.equal(f.lyz.recoveryRequired, true);
    assert.equal(f.alerts.at(-1).message.id, "lyz-msg-key-update-journal-retained");
    f.mappings.finishKeyUpdate = finish;
    assert.equal(await f.service.recoverPending(f.lyz), true);
    assert.equal(journals(f).length, 0);
});

test("a rejected promise after a durable commit cannot trigger file rollback", async t => {
    const f = await fixture(t);
    f.options.afterCommit = committed => { if (committed) throw new Error("late connection error"); };
    assert.equal(await f.lyz.updateBibtexAll(), true);
    assert.equal(journals(f)[0].state, "committed");
    assert.deepEqual(f.keys(), [{ zid: "1_A", key: "b" }, { zid: "1_B", key: "a" }]);
    assert.equal(f.events.filter(event => event[0] === "write").length, 3);
    f.options.afterCommit = null;
    assert.equal(await f.service.recoverPending(f.lyz), true);
    assert.equal(journals(f).length, 0);
});

test("unknown commit status retains the journal and files until a later verified recovery", async t => {
    const f = await fixture(t);
    f.options.writeFailure = f.docs[1];
    const list = f.mappings.listKeyUpdates.bind(f.mappings);
    let reads = 0;
    f.mappings.listKeyUpdates = async (...args) => {
        if (++reads > 1) throw new Error("database connection unavailable");
        return list(...args);
    };
    assert.equal(await f.lyz.updateBibtexAll(), false);
    assert.equal(f.lyz.recoveryRequired, true);
    assert.equal(f.events.filter(event => event[0] === "write").length, 3);
    assert.equal(journals(f)[0].state, "prepared");
    f.mappings.listKeyUpdates = list;
    f.options.writeFailure = null;
    assert.equal(await f.service.recoverPending(f.lyz), true);
    await f.unchangedFiles();
});

test("a live rollback does not overwrite an external edit to an already-written document", async t => {
    const f = await fixture(t);
    f.options.afterWrite = count => {
        if (count === 2) fs.writeFileSync(f.docs[0], "External edit after replacement");
    };
    assert.equal(await f.lyz.updateBibtexAll(), false);
    assert.equal(await fsp.readFile(f.docs[0], "utf8"), "External edit after replacement");
    assert.deepEqual(await fsp.readFile(f.bib), Buffer.from(f.originals.get(f.bib)));
    assert.equal(journals(f)[0].state, "prepared");
    assert.equal(f.lyz.recoveryRequired, true);
});

test("all completed writes are reverified immediately before the mapping commit", async t => {
    const f = await fixture(t);
    f.options.afterWrite = count => {
        if (count === 3) fs.appendFileSync(f.bib, "External bibliography edit");
    };
    assert.equal(await f.lyz.updateBibtexAll(), false);
    assert.equal(f.events.filter(event => event[0] === "database").length, 0);
    assert.match(await fsp.readFile(f.bib, "utf8"), /External bibliography edit/);
    assert.deepEqual(f.keys(), [{ zid: "1_A", key: "a" }, { zid: "1_B", key: "b" }]);
    assert.equal(journals(f).length, 1);
});

test("concurrent startup requests share one database initialization and one recovery pass", async t => {
    const f = await fixture(t);
    const connection = f.lyz.DB;
    let opened = 0;
    let migrated = 0;
    f.context.Zotero.DBConnection = function() { opened++; return connection; };
    f.context.Zotero.Schema = { schemaUpdatePromise: Promise.resolve() };
    f.context.Services.prefs = { getBranch: () => ({ getBoolPref: () => true }) };
    f.context.Services.obs = { addObserver() {} };
    f.context.Components.classes["@mozilla.org/appshell/window-mediator;1"] = { getService: () => ({}) };
    f.lyz.setDefaultPrefs = () => {};
    f.lyz.migrateToZotero5 = async () => { migrated++; };
    const first = f.lyz.init();
    const second = f.lyz.init();
    assert.equal(first, second);
    await Promise.all([first, second]);
    assert.equal(opened, 0, "the existing connection is reused for both requests");
    assert.equal(migrated, 1);
    assert.equal(f.lyz.initializationPromise, null);
});
