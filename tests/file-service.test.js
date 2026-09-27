"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function files(isWin) {
    const calls = [];
    const strict = (name, ...args) => {
        const paths = name === "copy" ? args.slice(0, 2) : args.slice(0, 1);
        if (isWin) for (const path of paths) assert.equal(path.includes("/"), false, "native Windows APIs reject LyX separators");
        if (isWin && name === "write" && args[2]?.tmpPath) assert.equal(args[2].tmpPath.includes("/"), false);
        calls.push([name, ...args]);
        return paths[0];
    };
    const context = vm.createContext({ Zotero: { isWin }, IOUtils: {}, PathUtils: {} });
    for (const name of ["read", "write", "copy", "stat", "remove"]) context.IOUtils[name] = (...args) => strict(name, ...args);
    for (const name of ["normalize", "isAbsolute", "parent", "filename"]) context.PathUtils[name] = (...args) => strict(name, ...args);
    vm.runInContext(readFileSync(resolve(__dirname, "../addon/chrome/content/lyz/file-service.js"), "utf8"), context);
    return { service: context.LyZFiles, calls };
}

test("Windows LyX drive and UNC paths reach native filesystem APIs with Unicode preserved", () => {
    const { service, calls } = files(true);
    for (const source of ["C:/Árvíztűrő/master.lyx", "//server/share/árvíz.lyx"]) {
        for (const method of ["read", "stat", "remove", "normalize", "isAbsolute", "parent", "filename"]) service[method](source);
        service.copy(source, source + ".lyz~");
        for (const call of calls.splice(0)) assert.equal(call[1], source.replace(/\//g, "\\"));
    }
});

test("atomic Windows writes normalize both destination and staging path without mutating journal options", () => {
    const { service, calls } = files(true);
    const bytes = new Uint8Array([1, 2]);
    const options = { tmpPath: "C:/á/file.lyx.token.tmp", flush: true };
    service.write("C:/á/file.lyx", bytes, options);
    assert.equal(calls[0][1], "C:\\á\\file.lyx");
    assert.equal(calls[0][2], bytes);
    assert.equal(calls[0][3].tmpPath, "C:\\á\\file.lyx.token.tmp");
    assert.equal(calls[0][3].flush, true);
    assert.equal(options.tmpPath, "C:/á/file.lyx.token.tmp");
});

test("Unix paths retain slashes and literal backslashes at every filesystem boundary", () => {
    const { service, calls } = files(false);
    const source = "/tmp/á\\b/master.lyx";
    const options = { tmpPath: source + ".tmp", flush: true };
    service.read(source);
    service.write(source, new Uint8Array(), options);
    service.copy(source, source + ".lyz~");
    assert.equal(calls.every(call => call[1] === source), true);
    assert.equal(calls[1][3].tmpPath, source + ".tmp");
});
