"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function transport(os, options = {}) {
    const sent = [];
    const alerts = [];
    let closed = 0;
    let terminated = 0;
    const workerContext = vm.createContext({ TextEncoder, TextDecoder, Uint8Array, setTimeout, onmessage: null });
    vm.runInContext(readFileSync(resolve(__dirname, "../addon/chrome/content/lyz/lyx-pipe-worker.js"), "utf8"), workerContext);
    const context = vm.createContext({ TextEncoder,
        Components: { classes: {}, interfaces: {} },
        Services: { prompt: { alert: (parent, title, text) => alerts.push(text) } },
        Zotero: { debug() {} }, LyZLocale: { getString: id => id }
    });
    vm.runInContext(readFileSync(resolve(__dirname, "../addon/chrome/content/lyz/lyx-server.js"), "utf8"), context);
    const server = context.LyZServer;
    server.sessionID = "fixture";
    server.responseTimeoutMS = 30;
    server.startTimer = (callback, ms) => { const id = setTimeout(callback, ms); return { cancel: () => clearTimeout(id) }; };
    server.createWorker = () => {
        let chunks = [];
        const worker = {
            terminate() { terminated++; },
            postMessage(request) {
                if (options.stallWorker) return;
                const io = {
                    open: async () => { if (options.openFailure) throw Object.assign(new Error("missing"), { code: "missing-pipe" }); return {}; },
                    write: (_fd, bytes) => {
                        const text = new TextDecoder().decode(bytes); sent.push(text);
                        const match = /^LYXCMD:([^:]+):([^:\n]+)(?::([^\n]*))?\n$/.exec(text);
                        assert.ok(match);
                        const response = options.reply ? options.reply(match) : "INFO:" + match[1] + ":" + match[2] + ":\n";
                        chunks = options.chunks ? options.chunks(response) : [new TextEncoder().encode(response)];
                        return options.shortWrite ? bytes.length - 1 : bytes.length;
                    },
                    read: () => {
                        if (options.disconnectOnce) { options.disconnectOnce = false; throw Object.assign(new Error("rotated"), { code: "pipe-disconnected" }); }
                        return chunks.shift() || null;
                    },
                    close() { closed++; }, dispose() {}
                };
                workerContext.LyZPipeWorker.run(request, io).then(
                    response => worker.onmessage({ data: { response } }),
                    error => worker.onmessage({ data: { error: { code: error.code, stage: error.stage, detail: error.message } } })
                );
            }
        };
        return worker;
    };
    return { server, sent, alerts, closed: () => closed, terminated: () => terminated,
        lyz: { os, prefs: { getCharPref: () => "testpipe" } } };
}

for (const os of ["Win", "Linux"]) {
    test(os + " key-update commands wait for acknowledgements and encode Unicode filenames as UTF-8", async () => {
        const f = transport(os);
        assert.equal(await f.server.requireCommand(f.lyz, "file-open:C:/Árvíztűrő/main.lyx"), "");
        assert.equal(f.sent[0], "LYXCMD:lyzfixture_1:file-open:C:/Árvíztűrő/main.lyx\n");
        assert.ok(f.closed() >= 2);
    });

    test(os + " refuses explicit LyX errors even when an earlier success for the same client exists", async () => {
        const f = transport(os, {
            reply: ([, client, command]) => "INFO:" + client + ":" + command + ":\n"
                + "ERROR:" + client + ":" + command + ":Document is read-only\n"
        });
        await assert.rejects(f.server.requireCommand(f.lyz, "buffer-write"), /Document is read-only/);
    });

    test(os + " rejects a response belonging to another client", async () => {
        const f = transport(os, { reply: () => "INFO:other:buffer-write:\n" });
        await assert.rejects(f.server.requireCommand(f.lyz, "buffer-write"), /timeout/);
    });
}

test("the client extractor ignores prefixed garbage and keeps a complete ERROR reply", () => {
    const f = transport("Win");
    assert.equal(f.server.extractClientResponse("lyz1", "buffer-close",
        "garbageINFO:lyz1:buffer-close:\nERROR:lyz1:buffer-close:Canceled\n"),
    "ERROR:lyz1:buffer-close:Canceled");
});

test("short command writes are rejected and the output stream is closed", async () => {
    const f = transport("Win", { shortWrite: true });
    await assert.rejects(f.server.requireCommand(f.lyz, "buffer-write"), /short-write/);
    assert.equal(f.closed(), 2);
});

test("commands with line breaks cannot inject a second LyX request", async () => {
    const f = transport("Win");
    await assert.rejects(f.server.requireCommand(f.lyz, "file-open:bad\nname.lyx"), /invalid-command/);
    assert.equal(f.sent.length, 0);
    assert.equal(f.closed(), 0);
});

test("split UTF-8 replies and incomplete lines cannot be mistaken for a complete response", async () => {
    const f = transport("Win", { reply: ([, client, command]) => "INFO:old:" + command + ":stale\nINFO:" + client + ":" + command + ":árvíz.lyx\n",
        chunks: response => [...new TextEncoder().encode(response)].map(byte => new Uint8Array([byte])) });
    assert.equal(await f.server.requireCommand(f.lyz, "server-get-filename"), "árvíz.lyx");
    assert.equal(f.closed(), 2);
});

test("a stalled worker is bounded and the next queued command still completes", async () => {
    const options = { stallWorker: true };
    const f = transport("Win", options);
    const first = f.server.requireCommand(f.lyz, "buffer-write");
    const rejected = assert.rejects(first, error => error.code === "timeout" && error.stage === "worker");
    setTimeout(() => { options.stallWorker = false; }, 20);
    const second = f.server.requireCommand(f.lyz, "buffer-close");
    await rejected;
    assert.equal(await second, "");
    assert.equal(f.terminated(), 2);
});

test("native open failures retain their category and terminate the worker", async () => {
    const f = transport("Win", { openFailure: true });
    await assert.rejects(f.server.requireCommand(f.lyz, "server-get-filename"), error => error.code === "missing-pipe");
    assert.equal(f.terminated(), 1);
});

test("a rotated output pipe reconnects without resending the command", async () => {
    const f = transport("Win", { disconnectOnce: true });
    f.server.responseTimeoutMS = 150;
    assert.equal(await f.server.requireCommand(f.lyz, "buffer-write"), "");
    assert.equal(f.sent.length, 1);
    assert.equal(f.closed(), 3);
});

test("Zotero menu operations are serialized and a failure does not block the next operation", async () => {
    const events = [];
    let release;
    const context = vm.createContext({
        Components: { classes: {}, interfaces: {} },
        Services: { wm: { getMostRecentWindow: () => null } },
        Zotero: { logError() {}, Lyz: {
            first: async () => {
                events.push("first-start");
                await new Promise(resolve => { release = resolve; });
                events.push("first-end");
                throw new Error("first failed");
            },
            second: async () => { events.push("second"); return true; }
        } }
    });
    vm.runInContext(readFileSync(resolve(__dirname, "../addon/bootstrap.js"), "utf8"), context);
    const bootstrap = context.LyZBootstrap;
    bootstrap.ensureLyzInitialized = async () => {};
    const first = bootstrap.runCommand("first");
    const rejected = assert.rejects(first, /first failed/);
    const second = bootstrap.runCommand("second");
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ["first-start"]);
    release();
    await rejected;
    assert.equal(await second, true);
    assert.deepEqual(events, ["first-start", "first-end", "second"]);
});

test("unresolved recovery blocks mapping management but leaves settings available", async () => {
    let recoveryAttempts = 0;
    let writes = 0;
    const context = vm.createContext({
        Components: { classes: {}, interfaces: {} },
        Services: { wm: { getMostRecentWindow: () => null } },
        LyZKeyUpdate: { recoverPending: async () => { recoveryAttempts++; return false; } },
        Zotero: { logError() {}, Lyz: {
            initialized: true, recoveryRequired: true,
            dbDeleteBib: () => { writes++; }, settings: () => true
        } }
    });
    vm.runInContext(readFileSync(resolve(__dirname, "../addon/bootstrap.js"), "utf8"), context);
    const bootstrap = context.LyZBootstrap;
    bootstrap.ensureLyzInitialized = async () => {};
    assert.equal(await bootstrap.runCommand("dbDeleteBib"), false);
    assert.equal(writes, 0);
    assert.equal(recoveryAttempts, 1);
    assert.equal(await bootstrap.runCommand("settings"), true);
    assert.equal(recoveryAttempts, 1);
    context.Zotero.Lyz.initialized = false;
    bootstrap.ensureLyzInitialized = async () => { context.Zotero.Lyz.initialized = true; };
    assert.equal(await bootstrap.runCommand("dbDeleteBib"), false);
    assert.equal(recoveryAttempts, 1, "startup already handled recovery; do not prompt again in this command");
});

test("an unsafe database blocks data commands while diagnostics, settings and LyX commands remain usable", async () => {
    const messages = [];
    let writes = 0;
    const context = vm.createContext({
        Components: { classes: {}, interfaces: {} },
        Services: { wm: { getMostRecentWindow: () => null } },
        LyZKeyUpdate: { recoverPending: () => { throw new Error("must not recover an unsafe DB"); } },
        Zotero: { logError() {}, Lyz: {
            initialized: true, databaseBlocked: true, recoveryRequired: true,
            showDatabaseBlocked: () => messages.push("blocked"),
            dbDeleteBib: () => { writes++; }, checkAndCite: () => { writes++; },
            settings: () => "settings", test: () => "test", databaseDiagnostics: () => "diagnostics",
            mappingManager: () => "manager", mappingInventory: () => "inventory"
        } }
    });
    vm.runInContext(readFileSync(resolve(__dirname, "../addon/bootstrap.js"), "utf8"), context);
    const bootstrap = context.LyZBootstrap;
    bootstrap.ensureLyzInitialized = async () => {};
    assert.equal(await bootstrap.runCommand("dbDeleteBib"), false);
    assert.equal(await bootstrap.runCommand("checkAndCite"), false);
    assert.equal(writes, 0);
    assert.deepEqual(messages, ["blocked", "blocked"]);
    assert.equal(await bootstrap.runCommand("settings"), "settings");
    assert.equal(await bootstrap.runCommand("test"), "test");
    assert.equal(await bootstrap.runCommand("databaseDiagnostics"), "diagnostics");
    assert.equal(await bootstrap.runCommand("mappingManager"), "manager");
    assert.equal(await bootstrap.runCommand("mappingInventory"), "inventory");
    context.Zotero.Lyz.initialized = false;
    bootstrap.ensureLyzInitialized = async () => { context.Zotero.Lyz.initialized = true; };
    assert.equal(await bootstrap.runCommand("dbDeleteBib"), false);
    assert.deepEqual(messages, ["blocked", "blocked"], "startup already reports the problem once");
});
