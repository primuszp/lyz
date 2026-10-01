"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function fixture(os, options = {}) {
    const events = [];
    let fd = 3;
    let signalPending = false;
    const scalar = value => ({ value: value || 0, address() { return this; } });
    scalar.ptr = {};
    const array = { array: length => values => new Uint8Array(values || length) };
    const ctypes = { int: scalar, int64_t: scalar, ssize_t: scalar, size_t: scalar,
        char: scalar, voidptr_t: scalar, unsigned_long: array, uint8_t: array, errno: 0 };
    const functions = {
        open(path, flags) {
            events.push(["open", path, flags]);
            if (options.noReader && path.endsWith(".in")) { ctypes.errno = 6; return -1; }
            return fd++;
        },
        lseek() { ctypes.errno = options.regular ? 0 : 29; return options.regular ? 0 : -1; },
        close(value) { events.push(["close", value]); return 0; },
        read() { ctypes.errno = os === "Mac" ? 35 : 11; return -1; },
        write() { signalPending = true; ctypes.errno = 32; return -1; },
        sigemptyset() { return 0; }, sigaddset(_set, value) { assert.equal(value, 13); return 0; },
        pthread_sigmask(mode, mask, old) {
            events.push(["mask", mode, mask[0]]);
            if (old) old[0] = 42;
            return 0;
        },
        sigpending() { return 0; }, sigismember() { return signalPending ? 1 : 0; },
        sigwait() { events.push(["consume-signal"]); signalPending = false; return 0; }
    };
    ctypes.open = () => ({ declare(name) { assert.ok(functions[name], name); return functions[name]; }, close() { events.push(["library-close"]); } });
    const context = vm.createContext({ ctypes, TextEncoder, TextDecoder, Uint8Array, setTimeout, onmessage: null });
    vm.runInContext(readFileSync(resolve(__dirname, "../addon/chrome/content/lyz/lyx-pipe-worker.js"), "utf8"), context);
    const request = { path: "/isolated/pipe", os, bytes: new TextEncoder().encode("test\n"),
        clientID: "fixture", command: "test", requireResponse: true, deadline: Date.now() + 50 };
    return { events, request, worker: context.LyZPipeWorker };
}

for (const os of ["Linux", "Mac"]) {
    test(os + " refuses regular endpoints before writing and restores the thread signal mask", async () => {
        const f = fixture(os, { regular: true });
        await assert.rejects(f.worker.run(f.request, f.worker.unix(f.request)), error => error.code === "invalid-path");
        assert.equal(f.events.filter(row => row[0] === "open").length, 1);
        assert.ok(f.events.some(row => row[0] === "close" && row[1] === 3));
        assert.deepEqual(f.events.at(-2), ["mask", os === "Mac" ? 3 : 2, 42]);
    });

    test(os + " missing FIFO readers time out with nonblocking opens and clean the read endpoint", async () => {
        const f = fixture(os, { noReader: true });
        await assert.rejects(f.worker.run(f.request, f.worker.unix(f.request)), error => error.code === "timeout");
        assert.ok(f.events.filter(row => row[0] === "open").every(row => row[2] & (os === "Mac" ? 4 : 2048)));
        assert.ok(f.events.some(row => row[0] === "close" && row[1] === 3));
        assert.equal(f.events.at(-1)[0], "library-close");
    });

    test(os + " disconnected writers report EPIPE and consume SIGPIPE before restoring the mask", async () => {
        const f = fixture(os);
        await assert.rejects(f.worker.run(f.request, f.worker.unix(f.request)), /Unix error 32/);
        assert.equal(f.events.filter(row => row[0] === "close").length, 2);
        assert.equal(f.events.at(-3)[0], "consume-signal");
        assert.deepEqual(f.events.at(-2), ["mask", os === "Mac" ? 3 : 2, 42]);
    });
}
