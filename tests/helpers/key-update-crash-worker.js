"use strict";

const { fixture } = require("./key-update-fixture");
const fsp = require("node:fs/promises");

(async () => {
    const [, , directory, checkpoint] = process.argv;
    const f = await fixture({ after() {} }, { directory });
    if (checkpoint === "prepared") {
        const begin = f.mappings.beginKeyUpdate.bind(f.mappings);
        f.mappings.beginKeyUpdate = async (...args) => {
            await begin(...args);
            process.exit(73);
        };
    } else if (checkpoint === "staged") {
        f.context.IOUtils.write = async (path, bytes, options) => {
            await fsp.writeFile(options.tmpPath, bytes.slice(0, 10));
            process.exit(73);
        };
    } else if (/^write-[123]$/.test(checkpoint)) {
        f.options.afterWrite = count => {
            if (count === Number(checkpoint.slice(-1))) process.exit(73);
        };
    } else if (checkpoint === "before-commit") {
        f.options.beforeCommit = committed => { if (committed) process.exit(73); };
    } else if (checkpoint === "committed") {
        f.options.afterCommit = committed => { if (committed) process.exit(73); };
    } else {
        throw new Error("Unknown crash checkpoint");
    }
    await f.lyz.updateBibtexAll();
    throw new Error("Crash checkpoint was not reached");
})().catch(error => { console.error(error); process.exit(1); });
