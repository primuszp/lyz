"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { join, resolve } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { fixture } = require("./helpers/key-update-fixture");
const root = resolve(__dirname, "..");
const plain = value => JSON.parse(JSON.stringify(value));

async function mappings(t, options) {
    const f = await fixture(t, options);
    f.context.LyZLocale.getString = id => id;
    vm.runInContext(fs.readFileSync(join(root, "addon/chrome/content/lyz/mapping-service.js"), "utf8"), f.context);
    f.manager = f.context.LyZMappings;
    f.archive = () => f.database.prepare("SELECT source,record FROM migration_records ORDER BY id").all()
        .map(row => ({ source: row.source, ...JSON.parse(row.record) }));
    f.active = () => ({
        docs: f.database.prepare("SELECT * FROM docs ORDER BY id").all().map(row => ({ ...row })),
        keys: f.database.prepare("SELECT * FROM keys ORDER BY id").all().map(row => ({ ...row }))
    });
    return f;
}

test("inventory groups files and exposes missing documents, bibliographies and Zotero items without changing records", async t => {
    const f = await mappings(t);
    const before = f.active();
    await fsp.rm(f.docs[1]);
    f.lyz.getZoteroItem = zid => zid === "1_B" ? null : { getField: () => "Árvíztűrő title", deleted: false };
    const inventory = plain(await f.manager.inventory(f.lyz));
    assert.equal(inventory.docs.find(row => row.doc === f.docs[1]).file.state, "missing");
    assert.equal(inventory.bibs.find(row => row.bib === f.bib).documents, 2);
    assert.equal(inventory.bibs.find(row => row.bib === "other.bib").file.state, "invalid");
    assert.equal(inventory.keys.find(row => row.zid === "1_B").itemState, "missing");
    assert.equal(inventory.keys.find(row => row.zid === "1_A").title, "Árvíztűrő title");
    assert.equal(inventory.editable, true);
    assert.deepEqual(f.active(), before);
    assert.equal(f.events.length, 0);
});

test("document relinking requires a preview and archives its original mapping without writing files", async t => {
    const f = await mappings(t);
    const target = join(f.directory, "áthelyezett.lyx");
    await fsp.rename(f.docs[0], target);
    const before = f.active();
    const plan = await f.manager.preview(f.lyz, { action: "relink-doc", source: f.docs[0], target });
    assert.equal(plan.sourceMissing, true);
    assert.equal(plan.documents, 1);
    assert.equal(plan.keys, 0);
    assert.deepEqual(f.active(), before);
    plan.source = "untrusted UI mutation";
    plan.target = "untrusted UI mutation";
    assert.equal(await f.manager.apply(f.lyz, plan.id), true);
    assert.equal(f.active().docs[0].doc, fs.realpathSync(target));
    assert.equal(f.archive()[0].doc, f.docs[0]);
    assert.equal(f.archive()[0].operation, "relink-doc");
    assert.deepEqual(await fsp.readFile(target), Buffer.from(f.originals.get(f.docs[0])));
    assert.equal(f.events.length, 0);
    await assert.rejects(f.manager.apply(f.lyz, plan.id), /stale/);
});

test("bibliography relinking updates all associations atomically and preserves keys and original rows", async t => {
    const f = await mappings(t);
    const target = join(f.directory, "új könyvtár.bib");
    await fsp.rename(f.bib, target);
    const plan = await f.manager.preview(f.lyz, { action: "relink-bib", source: f.bib, target });
    assert.equal(plan.documents, 2);
    assert.equal(plan.keys, 2);
    assert.equal(await f.manager.apply(f.lyz, plan.id), true);
    const active = f.active();
    assert.equal(active.docs.filter(row => row.bib === target).length, 2);
    assert.deepEqual(active.keys.filter(row => row.bib === target).map(row => row.key), ["a", "b"]);
    assert.equal(active.keys.find(row => row.bib === "other.bib").key, "untouched");
    assert.equal(f.archive().length, 4);
    for (const doc of f.docs) assert.deepEqual(await fsp.readFile(doc), Buffer.from(f.originals.get(doc)));
    assert.equal(f.events.length, 0);
});

test("removing a bibliography archives every affected row and leaves all physical files unchanged", async t => {
    const f = await mappings(t);
    const plan = await f.manager.preview(f.lyz, { action: "delete-bib", source: f.bib });
    assert.equal(await f.manager.apply(f.lyz, plan.id), true);
    assert.equal(f.active().docs.length, 1);
    assert.equal(f.active().keys.length, 1);
    assert.equal(f.archive().length, 4);
    for (const [path, bytes] of f.originals) assert.deepEqual(await fsp.readFile(path), Buffer.from(bytes));
});

test("removing a document preserves bibliography keys and canceling a preview performs no changes", async t => {
    const f = await mappings(t);
    const before = f.active();
    const canceled = await f.manager.preview(f.lyz, { action: "delete-doc", source: f.docs[0] });
    f.manager.discard(canceled.id);
    await assert.rejects(f.manager.apply(f.lyz, canceled.id), /stale/);
    assert.deepEqual(f.active(), before);
    const plan = await f.manager.preview(f.lyz, { action: "delete-doc", source: f.docs[0] });
    await f.manager.apply(f.lyz, plan.id);
    assert.deepEqual(f.active().keys, before.keys);
    assert.equal(f.archive().length, 1);
    assert.deepEqual(await fsp.readFile(f.docs[0]), Buffer.from(f.originals.get(f.docs[0])));
});

test("an SQLite commit failure rolls back both the edit and its preserved records", async t => {
    const f = await mappings(t);
    const before = f.active();
    const plan = await f.manager.preview(f.lyz, { action: "delete-bib", source: f.bib });
    f.lyz.DB.executeTransaction = async callback => {
        f.database.exec("BEGIN");
        try { await callback(); throw new Error("commit failed"); }
        finally { f.database.exec("ROLLBACK"); }
    };
    await assert.rejects(f.manager.apply(f.lyz, plan.id), /commit failed/);
    assert.deepEqual(f.active(), before);
    assert.equal(f.archive().length, 0);
});

test("a change to any active mapping invalidates an open preview before any archive or edit", async t => {
    const f = await mappings(t);
    const plan = await f.manager.preview(f.lyz, { action: "delete-bib", source: f.bib });
    await f.mappings.insertKey(f.lyz, "external", "other.bib", "1_Z");
    const before = f.active();
    await assert.rejects(f.manager.apply(f.lyz, plan.id), /stale/);
    assert.deepEqual(f.active(), before);
    assert.equal(f.archive().length, 0);
});

test("replacement changes or reappearing originals invalidate a relink preview", async t => {
    for (const change of ["target", "source"]) {
        const f = await mappings(t);
        const target = join(f.directory, "moved.lyx");
        await fsp.rename(f.docs[0], target);
        const plan = await f.manager.preview(f.lyz, { action: "relink-doc", source: f.docs[0], target });
        if (change === "target") await fsp.appendFile(target, "external change");
        else await fsp.writeFile(f.docs[0], "original path appeared");
        const before = f.active();
        await assert.rejects(f.manager.apply(f.lyz, plan.id), /stale/);
        assert.deepEqual(f.active(), before);
        assert.equal(f.archive().length, 0);
    }
});

test("pending journals block editing even if the in-memory recovery flag was not set", async t => {
    const f = await mappings(t);
    const plan = await f.manager.preview(f.lyz, { action: "delete-doc", source: f.docs[0] });
    await f.lyz.DB.queryAsync("INSERT INTO key_updates VALUES('lyz-test',?,'prepared','raw journal')", [f.bib]);
    const inventory = await f.manager.inventory(f.lyz);
    assert.equal(inventory.editable, false);
    assert.equal(inventory.recovery[0].journal, "raw journal");
    await assert.rejects(f.manager.apply(f.lyz, plan.id), /blocked/);
    await assert.rejects(f.manager.preview(f.lyz, { action: "delete-doc", source: f.docs[0] }), /blocked/);
    assert.equal(f.archive().length, 0);
});

test("an occupied target or different source copy cannot silently merge or replace mappings", async t => {
    const f = await mappings(t);
    await assert.rejects(f.manager.preview(f.lyz, { action: "relink-doc", source: f.docs[0], target: f.docs[1] }), /occupied/);
    const target = join(f.directory, "different.lyx");
    await fsp.copyFile(f.docs[0], target);
    await fsp.appendFile(target, "different content");
    await assert.rejects(f.manager.preview(f.lyz, { action: "relink-doc", source: f.docs[0], target }), /mismatch/);
    assert.equal(f.archive().length, 0);
});

test("a relocated bibliography must preserve the exact item/key associations", async t => {
    const f = await mappings(t);
    const target = join(f.directory, "moved.bib");
    await fsp.rename(f.bib, target);
    await fsp.writeFile(target, "1_A 1_B\n@article{a,}\n@article{different,}\n");
    await assert.rejects(f.manager.preview(f.lyz, { action: "relink-bib", source: f.bib, target }), /mismatch/);
    assert.equal(f.keys().length, 2);
});

test("invalid, missing or directory replacements are rejected without changing mappings", async t => {
    const f = await mappings(t);
    const before = f.active();
    const invalid = join(f.directory, "invalid.lyx");
    await fsp.writeFile(invalid, "not a LyX document");
    await fsp.rm(f.docs[0]);
    for (const target of [invalid, join(f.directory, "missing.lyx"), f.directory, "relative.lyx"]) {
        await assert.rejects(f.manager.preview(f.lyz, { action: "relink-doc", source: f.docs[0], target }), /file/);
    }
    assert.deepEqual(f.active(), before);
});

test("inspection remains available when schema auditing blocks edits", async t => {
    const f = await mappings(t);
    f.lyz.databaseBlocked = true;
    const inventory = await f.manager.inventory(f.lyz);
    assert.equal(inventory.docs.length, 3);
    assert.equal(inventory.editable, false);
    await assert.rejects(f.manager.preview(f.lyz, { action: "delete-doc", source: f.docs[0] }), /blocked/);
});

test("partial inventory reads are visible and do not enable repairs", async t => {
    const f = await mappings(t);
    f.database.exec("DROP TABLE keys");
    const inventory = await f.manager.inventory(f.lyz);
    assert.equal(inventory.docs.length, 3);
    assert.equal(inventory.errors[0].table, "keys");
    assert.equal(inventory.editable, false);
});

test("a changed schema version invalidates a preview rather than adopting an unknown database", async t => {
    const f = await mappings(t);
    const plan = await f.manager.preview(f.lyz, { action: "delete-doc", source: f.docs[0] });
    f.database.exec("PRAGMA user_version=99");
    await assert.rejects(f.manager.apply(f.lyz, plan.id), /blocked/);
    assert.equal((await f.manager.inventory(f.lyz)).editable, false);
    assert.equal(f.archive().length, 0);
});

test("mapping reads and edits work with Zotero storage-row proxies", async t => {
    const f = await mappings(t);
    const query = f.lyz.DB.queryAsync.bind(f.lyz.DB);
    f.lyz.DB.queryAsync = async (...args) => (await query(...args)).map(row => new Proxy({}, {
        get: (_target, field) => {
            if (!(field in row)) throw new Error("Unknown DB column");
            return row[field];
        }
    }));
    assert.equal((await f.manager.inventory(f.lyz)).docs.length, 3);
    const plan = await f.manager.preview(f.lyz, { action: "delete-doc", source: f.docs[0] });
    assert.equal(await f.manager.apply(f.lyz, plan.id), true);
    assert.equal(f.archive()[0].doc, f.docs[0]);
});

test("all manager messages and variables match across English, German and Hungarian", () => {
    let reference;
    for (const locale of ["en-US", "de-DE", "hu-HU"]) {
        const content = fs.readFileSync(join(root, "addon/locale", locale, "lyz.ftl"), "utf8");
        const entries = [...content.matchAll(/^(lyz-manager-[a-z-]+) =([^]*?)(?=^[a-z]|^##|$(?![^]))/gm)]
            .map(([, id, body]) => ({ id, variables: [...body.matchAll(/\$([\w-]+)/g)].map(match => match[1]).sort() }));
        assert.ok(entries.length > 60);
        if (reference) assert.deepEqual(entries, reference);
        else reference = entries;
    }
});

test("large inventories count shared bibliographies correctly and bound concurrent file checks", async t => {
    const f = await mappings(t);
    const insert = f.database.prepare("INSERT INTO keys (key,bib,zid) VALUES (?,?,?)");
    f.database.exec("BEGIN");
    for (let i = 0; i < 3000; i++) insert.run("scale-" + i, join(f.directory, "scale-" + Math.floor(i / 10) + ".bib"), "1_SCALE" + i);
    f.database.exec("COMMIT");
    let active = 0, maximum = 0;
    let lookupCount = 0, ticked = false, responsiveAtEnd = false;
    const lookup = f.lyz.getZoteroItem.bind(f.lyz);
    f.lyz.getZoteroItem = zid => {
        if (++lookupCount === 1) setTimeout(() => { ticked = true; }, 0);
        if (lookupCount === 3003) responsiveAtEnd = ticked;
        return lookup(zid);
    };
    const inspected = [];
    f.manager.fileStatus = async path => {
        inspected.push(path); maximum = Math.max(maximum, ++active);
        await new Promise(resolve => setImmediate(resolve));
        active--;
        return { state: "ok" };
    };
    const result = await f.manager.inventory(f.lyz);
    assert.equal(result.keys.length, 3003);
    assert.equal(result.bibs.filter(row => row.bib.includes("scale-")).every(row => row.keys === 10 && row.documents === 0), true);
    assert.equal(result.bibs.find(row => row.bib === f.bib).documents, 2);
    assert.equal(new Set(inspected).size, inspected.length);
    assert.ok(maximum > 1 && maximum <= f.manager.fileConcurrency);
    assert.equal(responsiveAtEnd, true, "UI timers run during large item lookup batches");
    assert.equal(result.editable, true);
});
