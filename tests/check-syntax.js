"use strict";

const { execFileSync } = require("node:child_process");
const { readdirSync, statSync } = require("node:fs");
const { join, resolve } = require("node:path");

function findJavaScriptFiles(directory) {
    const files = [];
    for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
            files.push(...findJavaScriptFiles(path));
        } else if (path.endsWith(".js")) {
            files.push(path);
        }
    }
    return files;
}

const addonDirectory = resolve(__dirname, "..", "addon");
for (const file of findJavaScriptFiles(addonDirectory)) {
    execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

console.log("All add-on JavaScript files passed syntax validation.");
