"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const vm = require("node:vm");

function fixture(t, options = {}) {
    const db = new DatabaseSync(":memory:");
    t.after(() => db.close());
    db.exec("CREATE TABLE docs (id INTEGER PRIMARY KEY, doc TEXT UNIQUE, bib TEXT);"
        + "CREATE TABLE keys (id INTEGER PRIMARY KEY, key TEXT, bib TEXT, zid TEXT, UNIQUE(bib,zid));");
    const bib = "/tmp/shared.bib";
    const doc = "/tmp/new.lyx";
    for (const [zid, key] of options.mappings || [["1_A", "oldA"], ["1_C", "oldC"]]) {
        db.prepare("INSERT INTO keys (zid,key,bib) VALUES (?,?,?)").run(zid, key, bib);
    }
    if (options.associated) db.prepare("INSERT INTO docs (doc,bib) VALUES (?,?)").run(doc, bib);
    const selected = options.selected || ["1_A", "1_B"];
    const writes = [], commands = [], events = [];
    const original = "1_A 1_C\n@article{oldA,}\n@book{oldC,}\n";
    let file = options.missing ? null : original;
    const win = { ZoteroPane: { getSelectedItems: () => selected.map(id => ({ id, key: id.slice(2) })) },
        confirm: () => true, alert() {} };
    const context = vm.createContext({
        TextEncoder, TextDecoder,
        Zotero: { Promise: { coroutine: generator => generator }, debug() {} },
        Services: { console: { logStringMessage() {} }, prompt: { confirm: () => true } },
        PathUtils: {}, lyz_charmap: {}, LyZLocale: { getString: id => id }
    });
    for (const name of ["database-service", "bibtex-service", "lyx-server", "lyz"]) {
        vm.runInContext(readFileSync(resolve(__dirname, "../addon/chrome/content/lyz/" + name + ".js"), "utf8"), context);
    }
    const lyz = context.Zotero.Lyz;
    lyz.os = "Linux";
    lyz.DB = { async queryAsync(sql, params = []) {
        const statement = db.prepare(sql);
        if (/^SELECT/i.test(sql)) return statement.all(...params);
        events.push("database"); statement.run(...params); return [];
    } };
    lyz.wm = { getMostRecentWindow: () => win };
    lyz.getZoteroItem = zid => options.unavailable === zid ? null : { id: zid, key: zid.slice(2) };
    lyz.fileExists = () => file !== null;
    lyz.lyxGetDoc = async () => doc;
    lyz.selectBibForDocument = async () => ({ path: bib, replace: true });
    lyz.exportToBibtex = async items => Object.fromEntries(items.map(item => {
        const key = options.duplicate ? "oldA" : "generated" + item.key;
        return [item.id, [key, options.invalid === item.id ? "not BibTeX" : "@article{" + key + ",\n title={Updated " + item.key + "}\n}\n"]];
    }));
    lyz.writeBib = (path, text, zids, flags) => {
        if (options.writeFailure) throw new Error("disk full");
        events.push("file");
        assert.equal(path, bib);
        writes.push({ text, zids: [...zids], replace: flags.replace });
        file = zids.join(" ") + "\n" + text;
    };
    context.LyZServer.writeAndRead = async (_lyz, command) => {
        commands.push(command);
        const name = command.split(":")[0];
        return "INFO:fixture:" + name + ":" + (name === "server-get-xy" ? "12 34" : "");
    };
    return { lyz, db, bib, doc, writes, commands, events, original, file: () => file,
        keys: () => db.prepare("SELECT zid,key FROM keys ORDER BY zid").all().map(row => ({ ...row })) };
}

test("replacement keeps mapped and unselected entries, adds new ones and cites preserved keys", async t => {
    const f = fixture(t);
    await f.lyz.checkAndCite();
    assert.equal(f.writes.length, 1);
    assert.deepEqual(f.writes[0].zids, ["1_A", "1_C", "1_B"]);
    assert.equal(f.writes[0].replace, true);
    for (const key of ["oldA", "oldC", "generatedB"]) assert.ok(f.file().includes("{" + key + ","));
    assert.match(f.file(), /Updated A/);
    assert.deepEqual(f.keys(), [{ zid: "1_A", key: "oldA" }, { zid: "1_B", key: "generatedB" }, { zid: "1_C", key: "oldC" }]);
    assert.equal(f.commands.at(-1), "citation-insert:oldA,generatedB");
    assert.equal(f.events[0], "file");
    assert.equal(f.db.prepare("SELECT bib FROM docs WHERE doc=?").get(f.doc).bib, f.bib);
});

test("replacement writes the complete bibliography even when every selected item is already mapped", async t => {
    const f = fixture(t, { selected: ["1_A"] });
    await f.lyz.checkAndCite();
    assert.equal(f.writes.length, 1);
    assert.deepEqual(f.writes[0].zids, ["1_A", "1_C"]);
    assert.equal(f.commands.at(-1), "citation-insert:oldA");
});

test("missing bibliography recreation preserves old document keys and includes new selections once", async t => {
    const f = fixture(t, { missing: true, associated: true });
    await f.lyz.checkAndCite();
    assert.deepEqual(f.writes[0].zids, ["1_A", "1_C", "1_B"]);
    assert.ok(f.file().includes("{oldA,") && f.file().includes("{oldC,"));
    assert.equal(f.commands.at(-1), "citation-insert:oldA,generatedB");
});

for (const options of [{ unavailable: "1_C" }, { invalid: "1_C" }, { duplicate: true }, { writeFailure: true }]) {
    test("unsafe replacement preserves file and mappings: " + JSON.stringify(options), async t => {
        const f = fixture(t, options);
        const before = f.keys();
        await assert.rejects(f.lyz.checkAndCite());
        assert.equal(f.file(), f.original);
        assert.deepEqual(f.keys(), before);
        assert.equal(f.db.prepare("SELECT count(*) AS n FROM docs").get().n, 0);
        assert.deepEqual(f.commands, []);
        assert.deepEqual(f.writes, []);
    });
}

test("changed-key citation gets and restores the cursor, then inserts the committed key", async t => {
    const f = fixture(t, { associated: true, selected: ["1_A"] });
    f.lyz.updateBibtexAll = async () => {
        f.commands.push("coordinated-update");
        f.db.prepare("UPDATE keys SET key='committedA' WHERE zid='1_A'").run();
        return true;
    };
    await f.lyz.checkAndCite();
    assert.deepEqual(f.commands, ["server-get-xy", "coordinated-update", "server-set-xy:12 34", "citation-insert:committedA"]);
    assert.deepEqual(f.writes, []);
});
