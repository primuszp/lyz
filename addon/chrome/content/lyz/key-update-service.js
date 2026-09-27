// Coordinates recoverable file changes before committing citation-key mappings.
var LyZKeyUpdate = {
    busy: false,

    equalBytes(left, right) {
        return left.length === right.length && left.every((value, index) => value === right[index]);
    },

    decode(bytes) {
        // Reject invalid UTF-8 rather than silently changing a document's encoding.
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    },

    parseBibliography(bytes, existingKeys = []) {
        var text = this.decode(bytes).replace(/^\uFEFF/, "");
        var newline = text.indexOf("\n");
        if (newline < 0) {
            throw new Error("Missing LyZ bibliography header");
        }
        var header = text.slice(0, newline).trim();
        var zids = header ? header.split(/\s+/) : [];
        var entries = [];
        var expression = /^\s*@([a-zA-Z]+)\s*[({]\s*([^,\s]+)\s*,/gm;
        var match;
        while ((match = expression.exec(text.slice(newline + 1))) !== null) {
            if (!/^(comment|string|preamble)$/i.test(match[1])) {
                entries.push(match[2]);
            }
        }
        if (entries.length !== zids.length || new Set(zids).size !== zids.length
                || new Set(entries).size !== entries.length) {
            throw new Error("Ambiguous LyZ bibliography header or citation keys");
        }
        for (var record of existingKeys) {
            var position = entries.indexOf(record.key);
            if (position !== -1 && zids.includes(record.zid) && zids[position] !== record.zid) {
                throw new Error("Bibliography entry order disagrees with the LyZ identifier header");
            }
        }
        var oldkeys = Object.create(null);
        zids.forEach((zid, index) => { oldkeys[entries[index]] = zid; });
        return { zids, oldkeys };
    },

    rewriteDocument(bytes, oldkeys, newkeys) {
        var text = this.decode(bytes);
        var lines = text.split(/(\r\n|\n|\r)/);
        var citation = false;
        for (var index = 0; index < lines.length; index += 2) {
            var line = lines[index];
            if (/^\\begin_inset\s+CommandInset\s+citation\s*$/.test(line)) {
                citation = true;
            } else if (/^\\end_inset\s*$/.test(line)) {
                citation = false;
            } else if (citation && /^key\b/.test(line)) {
                var match = /^(key\s+")([^"]*)("\s*)$/.exec(line);
                if (!match) {
                    throw new Error("Malformed LyX citation key line");
                }
                var keys = match[2].split(",").map(key => {
                    var parts = /^(\s*)(\S*?)(\s*)$/.exec(key);
                    var zid = oldkeys[parts[2]];
                    var replacement = zid === undefined ? undefined : newkeys[zid];
                    return replacement === undefined ? key : parts[1] + replacement + parts[3];
                });
                lines[index] = match[1] + keys.join(",") + match[3];
            }
        }
        return new TextEncoder().encode(lines.join(""));
    },

    async run(lyz, plan) {
        if (this.busy) {
            throw new Error("A LyZ key update is already running");
        }
        var files = [];
        var closed = [];
        var committed = false;
        var path = plan.bib;
        var stage = "read";
        var token = "lyz-" + Services.uuid.generateUUID().toString().replace(/[{}]/g, "");
        this.busy = true;
        var error = null;
        var reopenErrors = [];
        try {
            // Preflight every file before touching any LyX buffer.
            var documents = plan.rewriteDocuments
                ? await LyZDatabase.getDocumentsForBib(lyz, plan.bib) : [];
            var paths = Array.from(new Set(documents.map(record => record.doc)));
            if (plan.rewriteDocuments && !paths.includes(plan.doc)) {
                throw new Error("The active document is no longer associated with this bibliography");
            }
            for (var doc of paths) {
                path = doc;
                this.rewriteDocument(await IOUtils.read(doc), plan.oldkeys, plan.newkeys);
            }
            if (plan.rewriteDocuments) {
                stage = "lyx";
                // file-open selects an existing buffer too, so unsaved edits are saved
                // before snapshots are taken. Never rewrite a live buffer on disk.
                for (var doc of paths) {
                    path = doc;
                    await LyZServer.requireCommand(lyz, "file-open:" + doc);
                    var active = await LyZServer.requireCommand(lyz, "server-get-filename");
                    if (this.normalizePath(active, lyz.os) !== this.normalizePath(doc, lyz.os)) {
                        throw new Error("LyX selected a different document");
                    }
                    // A normal buffer-write is disabled when the buffer is clean.
                    await LyZServer.requireCommand(lyz, "buffer-write:force");
                    await LyZServer.requireCommand(lyz, "buffer-close");
                    closed.push(doc);
                    var current = await LyZServer.requireCommand(lyz, "server-get-filename");
                    if (this.normalizePath(current, lyz.os) === this.normalizePath(doc, lyz.os)) {
                        throw new Error("LyX did not close the document");
                    }
                }
            }
            stage = "read";
            path = plan.bib;
            var originalBib = await IOUtils.read(path);
            if (!this.equalBytes(originalBib, plan.originalBib)) {
                throw new Error("Bibliography changed while preparing the update");
            }
            files.push({ path, original: originalBib, next: plan.bibBytes });
            for (var doc of paths) {
                path = doc;
                var original = await IOUtils.read(doc);
                var next = this.rewriteDocument(original, plan.oldkeys, plan.newkeys);
                if (!this.equalBytes(original, next)) {
                    files.push({ path, original, next });
                }
            }
            stage = "backup";
            for (var file of files) {
                path = file.path;
                file.backup = file.path + "." + token + ".lyz~";
                file.tmp = file.path + "." + token + ".tmp";
                await IOUtils.copy(file.path, file.backup, { noOverwrite: true });
                if (!this.equalBytes(await IOUtils.read(file.backup), file.original)) {
                    throw new Error("Backup verification failed");
                }
                file.backupVerified = true;
            }
            stage = "write";
            for (var file of files) {
                path = file.path;
                if (!this.equalBytes(await IOUtils.read(file.path), file.original)) {
                    throw new Error("File changed after its backup was created");
                }
                // Include a write attempt in rollback even when IOUtils rejects.
                file.attempted = true;
                await IOUtils.write(file.path, file.next, { tmpPath: file.tmp, flush: true });
                if (!this.equalBytes(await IOUtils.read(file.path), file.next)) {
                    throw new Error("File write verification failed");
                }
            }
            stage = "database";
            path = plan.bib;
            await LyZDatabase.replaceKeysForBib(lyz, plan.bib, plan.newkeys);
            committed = true;
        } catch (failure) {
            var rollbackErrors = [];
            for (var file of files.slice().reverse()) {
                if (!file.attempted) continue;
                try {
                    if (this.equalBytes(await IOUtils.read(file.path), file.original)) continue;
                    var backup = await IOUtils.read(file.backup);
                    if (!this.equalBytes(backup, file.original)) {
                        throw new Error("Backup changed; refusing to restore it");
                    }
                    await IOUtils.write(file.path, backup, { tmpPath: file.tmp, flush: true });
                    if (!this.equalBytes(await IOUtils.read(file.path), file.original)) {
                        throw new Error("Restore verification failed");
                    }
                } catch (rollbackError) {
                    rollbackErrors.push(file.path + ": " + rollbackError);
                }
            }
            error = new Error(String(failure));
            error.path = path;
            error.stage = stage;
            error.rollbackErrors = rollbackErrors;
            error.backups = files.filter(file => file.backupVerified).map(file => file.backup);
        } finally {
            // Reopen the original active document last on both success and failure.
            var reopen = closed.filter(doc => doc !== plan.doc);
            if (closed.includes(plan.doc)) reopen.push(plan.doc);
            for (var doc of reopen) {
                try {
                    await LyZServer.requireCommand(lyz, "file-open:" + doc);
                } catch (reopenError) {
                    reopenErrors.push(doc + ": " + reopenError);
                }
            }
            for (var file of files) {
                if (!file.tmp) continue;
                try {
                    await IOUtils.remove(file.tmp, { ignoreAbsent: true });
                } catch (cleanupError) {
                    Zotero.logError(cleanupError);
                }
            }
            this.busy = false;
        }
        if (error) {
            error.reopenErrors = reopenErrors;
            throw error;
        }
        return { committed, reopenErrors, backups: files.map(file => file.backup) };
    },

    normalizePath(path, os) {
        path = String(path || "");
        return os === "Win" ? path.replace(/\\/g, "/").toLowerCase() : path;
    }
};
