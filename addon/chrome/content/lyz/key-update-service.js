// Coordinates recoverable file changes before committing citation-key mappings.
var LyZKeyUpdate = {
    busy: false,

    equalBytes(left, right) {
        return left.length === right.length && left.every((value, index) => value === right[index]);
    },

    fingerprint(bytes) {
        var hash = Components.classes["@mozilla.org/security/hash;1"]
            .createInstance(Components.interfaces.nsICryptoHash);
        hash.init(hash.SHA256);
        hash.update(bytes, bytes.length);
        return Array.from(hash.finish(false), char => char.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    },

    keysEqual(records, keys) {
        return records.length === Object.keys(keys).length
            && records.every(record => Object.prototype.hasOwnProperty.call(keys, record.zid)
                && keys[record.zid] === record.key);
    },

    async cleanupTemporaryFiles(files) {
        for (var file of files) {
            if (!file.tmp) continue;
            try {
                await IOUtils.remove(file.tmp, { ignoreAbsent: true });
            } catch (cleanupError) {
                Zotero.logError(cleanupError);
            }
        }
    },

    validateJournal(row, os) {
        var journal = JSON.parse(row.journal);
        var absolute = path => typeof path === "string" && /^(?:\/|[a-zA-Z]:[\\/]|\\\\)/.test(path);
        var keyMap = keys => keys && !Array.isArray(keys) && typeof keys === "object"
            && Object.values(keys).every(key => typeof key === "string");
        if (!journal || journal.version !== 1 || journal.id !== row.id || journal.bib !== row.bib
                || !/^lyz-[a-zA-Z0-9-]+$/.test(row.id) || !absolute(row.bib)
                || !["prepared", "committed"].includes(row.state)
                || !keyMap(journal.oldKeys) || !keyMap(journal.newKeys)
                || !Array.isArray(journal.files) || !journal.files.length
                || journal.files[0].path !== row.bib) {
            throw new Error("Unsupported or malformed key-update journal");
        }
        var seen = new Set();
        for (var file of journal.files) {
            if (!file || !absolute(file.path) || file.backup !== file.path + "." + row.id + ".lyz~"
                    || file.tmp !== file.path + "." + row.id + ".tmp"
                    || !/^[a-f0-9]{64}$/.test(file.originalHash) || !/^[a-f0-9]{64}$/.test(file.nextHash)
                    || seen.has(this.normalizePath(file.path, os))) {
                throw new Error("Invalid file record in key-update journal");
            }
            seen.add(this.normalizePath(file.path, os));
        }
        return journal;
    },

    async recoverOne(lyz, row) {
        var path = row.bib;
        var journal;
        try {
            journal = this.validateJournal(row, lyz.os);
            var expectedKeys = row.state === "committed" ? journal.newKeys : journal.oldKeys;
            if (!this.keysEqual(await LyZDatabase.getKeysForBib(lyz, row.bib), expectedKeys)) {
                throw new Error("Mappings changed since the interrupted update");
            }
            var changed = [];
            // Preflight the entire set before asking or restoring any file.
            for (var file of journal.files) {
                path = file.path;
                var current = this.fingerprint(await IOUtils.read(path));
                if (row.state === "committed") {
                    if (current !== file.nextHash) throw new Error("Committed file changed or is incomplete");
                } else if (current !== file.originalHash) {
                    if (current !== file.nextHash) throw new Error("File contains an external or unrecognized edit");
                    if (this.fingerprint(await IOUtils.read(file.backup)) !== file.originalHash) {
                        throw new Error("Recovery backup verification failed");
                    }
                    changed.push(file);
                }
            }
            if (changed.length) {
                if (!lyz.confirm(LyZLocale.getString("lyz-msg-recovery-confirm", {
                    files: journal.files.map(file => file.path).join("\n")
                }), LyZLocale.getString("lyz-msg-recovery-title"))) return false;
                // A confirmation dialog can remain open while files change.
                for (var file of journal.files) {
                    path = file.path;
                    var expected = changed.includes(file) ? file.nextHash : file.originalHash;
                    if (this.fingerprint(await IOUtils.read(path)) !== expected) {
                        throw new Error("File changed while waiting for recovery confirmation");
                    }
                }
                for (var file of changed.slice().reverse()) {
                    path = file.path;
                    var backup = await IOUtils.read(file.backup);
                    if (this.fingerprint(backup) !== file.originalHash) {
                        throw new Error("Recovery backup changed before restore");
                    }
                    // Never overwrite an intervening edit, even during recovery.
                    if (this.fingerprint(await IOUtils.read(path)) !== file.nextHash) {
                        throw new Error("File changed before restore");
                    }
                    await IOUtils.write(path, backup, { tmpPath: file.tmp, flush: true });
                    if (this.fingerprint(await IOUtils.read(path)) !== file.originalHash) {
                        throw new Error("Recovery restore verification failed");
                    }
                }
            }
            // Check again before retiring the only persistent recovery record.
            for (var file of journal.files) {
                path = file.path;
                var expected = row.state === "committed" ? file.nextHash : file.originalHash;
                if (this.fingerprint(await IOUtils.read(path)) !== expected) {
                    throw new Error("File changed before recovery completed");
                }
            }
            path = row.bib;
            if (!this.keysEqual(await LyZDatabase.getKeysForBib(lyz, row.bib), expectedKeys)) {
                throw new Error("Mappings changed during recovery");
            }
            await this.cleanupTemporaryFiles(journal.files);
            await LyZDatabase.finishKeyUpdate(lyz, row.id);
            if (changed.length) {
                lyz.alert(LyZLocale.getString("lyz-msg-recovery-complete", {
                    files: journal.files.map(file => file.path).join("\n")
                }), LyZLocale.getString("lyz-msg-recovery-title"));
            }
            return true;
        } catch (error) {
            Zotero.logError(error);
            lyz.alert(LyZLocale.getString("lyz-msg-recovery-blocked", {
                path, error: String(error),
                backups: journal ? journal.files.map(file => file.backup).join("\n") : row.id
            }), LyZLocale.getString("lyz-msg-recovery-title"));
            return false;
        }
    },

    async recoverPending(lyz) {
        LyZDatabase.assertWritable(lyz);
        if (this.busy) {
            lyz.recoveryRequired = true;
            return false;
        }
        this.busy = true;
        lyz.recoveryRequired = true;
        try {
            for (var row of await LyZDatabase.listKeyUpdates(lyz)) {
                if (!await this.recoverOne(lyz, row)) return false;
            }
            lyz.recoveryRequired = false;
            return true;
        } catch (error) {
            Zotero.logError(error);
            lyz.alert(LyZLocale.getString("lyz-msg-recovery-blocked", {
                path: "lyz.sqlite", error: String(error), backups: ""
            }), LyZLocale.getString("lyz-msg-recovery-title"));
            return false;
        } finally {
            this.busy = false;
        }
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
        LyZDatabase.assertWritable(lyz);
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
        var journalCreated = false;
        var recoveryWarning = false;
        try {
            if ((await LyZDatabase.listKeyUpdates(lyz)).length) {
                lyz.recoveryRequired = true;
                throw new Error("An earlier key update needs recovery first");
            }
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
            stage = "journal";
            path = plan.bib;
            await LyZDatabase.beginKeyUpdate(lyz, token, plan.bib, {
                version: 1, id: token, bib: plan.bib, newKeys: plan.newkeys,
                files: files.map(file => ({
                    path: file.path, backup: file.backup, tmp: file.tmp,
                    originalHash: this.fingerprint(file.original), nextHash: this.fingerprint(file.next)
                }))
            });
            journalCreated = true;
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
            for (var file of files) {
                path = file.path;
                if (!this.equalBytes(await IOUtils.read(path), file.next)) {
                    throw new Error("File changed before the mapping commit");
                }
            }
            path = plan.bib;
            await LyZDatabase.replaceKeysForBib(lyz, plan.bib, plan.newkeys, token);
            committed = true;
            try {
                await LyZDatabase.finishKeyUpdate(lyz, token);
            } catch (cleanupError) {
                // The mappings and commit marker are already durable together.
                // Keep the successful files; startup will retire this marker.
                Zotero.logError(cleanupError);
                lyz.recoveryRequired = true;
                recoveryWarning = true;
            }
        } catch (failure) {
            var rollbackErrors = [];
            var canRollback = true;
            if (journalCreated) {
                // A connection can reject after COMMIT has already reached disk.
                // The durable marker, not the rejected promise, decides rollback.
                try {
                    var update = (await LyZDatabase.listKeyUpdates(lyz)).find(row => row.id === token);
                    if (update && update.state === "committed") {
                        committed = true;
                        recoveryWarning = true;
                        canRollback = false;
                        lyz.recoveryRequired = true;
                    } else if (!update || update.state !== "prepared"
                            || !this.keysEqual(await LyZDatabase.getKeysForBib(lyz, plan.bib),
                                JSON.parse(update.journal).oldKeys)) {
                        canRollback = false;
                        rollbackErrors.push("Cannot verify the original mapping state; recovery is required");
                    }
                } catch (stateError) {
                    canRollback = false;
                    rollbackErrors.push("Cannot determine whether mappings committed: " + stateError);
                }
            }
            if (canRollback) for (var file of files.slice().reverse()) {
                if (!file.attempted) continue;
                try {
                    var current = await IOUtils.read(file.path);
                    if (this.equalBytes(current, file.original)) continue;
                    if (!this.equalBytes(current, file.next)) {
                        throw new Error("External or unrecognized edit; refusing to overwrite it");
                    }
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
            if (committed) {
                Zotero.logError(failure);
            } else {
                error = new Error(String(failure));
                error.path = path;
                error.stage = stage;
                error.rollbackErrors = rollbackErrors;
                error.backups = files.filter(file => file.backupVerified).map(file => file.backup);
            }
            if (journalCreated && !committed) {
                if (!rollbackErrors.length) {
                    try {
                        await LyZDatabase.finishKeyUpdate(lyz, token);
                    } catch (cleanupError) {
                        Zotero.logError(cleanupError);
                        lyz.recoveryRequired = true;
                    }
                } else {
                    lyz.recoveryRequired = true;
                }
            }
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
            await this.cleanupTemporaryFiles(files);
            this.busy = false;
        }
        if (error) {
            error.reopenErrors = reopenErrors;
            throw error;
        }
        return { committed, reopenErrors, recoveryWarning, backups: files.map(file => file.backup) };
    },

    normalizePath(path, os) {
        path = String(path || "");
        return os === "Win" ? path.replace(/\\/g, "/").toLowerCase() : path;
    }
};
