"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function transport(os, options = {}) {
    const sent = [];
    const alerts = [];
    let response = "";
    let closed = 0;
    const components = {
        "@mozilla.org/file/local;1": () => ({ initWithPath() {}, exists: () => true }),
        "@mozilla.org/network/file-input-stream;1": () => ({ init() {} }),
        "@mozilla.org/intl/converter-input-stream;1": () => ({
            init() {}, close() { closed++; }, readString(count, str) { str.value = response; }
        }),
        "@mozilla.org/network/file-output-stream;1": () => ({
            init() {}, close() { closed++; }, write(data, count) {
                const bytes = Uint8Array.from(data, char => char.charCodeAt(0));
                const text = new TextDecoder().decode(bytes);
                assert.equal(count, bytes.length);
                sent.push(text);
                const match = /^LYXCMD:([^:]+):([^:\n]+)(?::([^\n]*))?\n$/.exec(text);
                assert.ok(match);
                response = options.reply ? options.reply(match) : "INFO:" + match[1] + ":" + match[2] + ":";
                return options.shortWrite ? count - 1 : count;
            }
        })
    };
    const context = vm.createContext({
        TextEncoder,
        Components: {
            interfaces: {},
            classes: Object.fromEntries(Object.entries(components)
                .map(([key, factory]) => [key, { createInstance: factory }]))
        },
        Services: { prompt: { alert: (parent, title, text) => alerts.push(text) } },
        Zotero: { debug() {} },
        LyZLocale: { getString: id => id }
    });
    vm.runInContext(readFileSync(resolve(__dirname, "../addon/chrome/content/lyz/lyx-server.js"), "utf8"), context);
    const server = context.LyZServer;
    server.responseTimeoutMS = 2;
    server.delay = async () => {};
    return {
        server, sent, alerts, closed: () => closed,
        lyz: { os, prefs: { getCharPref: () => "testpipe" } }
    };
}

for (const os of ["Win", "Linux"]) {
    test(os + " key-update commands wait for acknowledgements and encode Unicode filenames as UTF-8", async () => {
        const f = transport(os);
        assert.equal(await f.server.requireCommand(f.lyz, "file-open:C:/Árvíztűrő/main.lyx"), "");
        assert.equal(f.sent[0], "LYXCMD:lyz1:file-open:C:/Árvíztűrő/main.lyx\n");
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
        await assert.rejects(f.server.requireCommand(f.lyz, "buffer-write"), /no response/);
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
    await assert.rejects(f.server.requireCommand(f.lyz, "buffer-write"), /no response/);
    assert.equal(f.closed(), 1);
});

test("commands with line breaks cannot inject a second LyX request", async () => {
    const f = transport("Win");
    await assert.rejects(f.server.requireCommand(f.lyz, "file-open:bad\nname.lyx"), /no response/);
    assert.equal(f.sent.length, 0);
    assert.equal(f.closed(), 1);
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
