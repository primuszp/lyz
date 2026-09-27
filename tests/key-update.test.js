"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { fixture, bytes, citation } = require("./helpers/key-update-fixture");
const root = resolve(__dirname, "..");

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
        "lyz-msg-key-update-failed", "lyz-msg-key-update-reopen-failed",
        "lyz-msg-recovery-title", "lyz-msg-recovery-confirm", "lyz-msg-recovery-complete",
        "lyz-msg-recovery-blocked", "lyz-msg-key-update-journal-retained"];
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
