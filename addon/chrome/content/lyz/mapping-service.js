// Read-only inventory and previewed, archived mapping edits. No document/file writes.
var LyZMappings = {
    plans: new Map(),
    busy: false,

    error(id, args) {
        return new Error(LyZLocale.getString("lyz-manager-error-" + id, args));
    },

    normalize(path, os) {
        try { path = PathUtils.normalize(path); } catch (_) { /* Keep stale paths visible. */ }
        return os === "Win" ? path.replace(/\\/g, "/").toLowerCase() : path;
    },

    async fileStatus(path) {
        if (typeof path !== "string" || !path || !PathUtils.isAbsolute(path)) return { state: "invalid" };
        try {
            var info = await IOUtils.stat(path);
            return { state: info.type === "regular" ? "ok" : "invalid" };
        } catch (error) {
            return { state: error.name === "NotFoundError" ? "missing" : "unreadable", error: String(error) };
        }
    },

    async inventory(lyz) {
        var result = { docs: [], bibs: [], keys: [], recovery: [], archive: [], errors: [], editable: false };
        var read = async (table, columns) => {
            try {
                return (await lyz.DB.queryAsync("SELECT " + columns.join(",") + " FROM " + table + " ORDER BY id"))
                    .map(row => {
                        var record = {};
                        for (var column of columns) record[column] = row[column];
                        return record;
                    });
            } catch (error) {
                result.errors.push({ table, error: String(error) });
                return [];
            }
        };
        var snapshot = async () => {
            result.docs = await read("docs", ["id", "doc", "bib"]);
            result.keys = await read("keys", ["id", "key", "bib", "zid"]);
            result.recovery = await read("key_updates", ["id", "bib", "state", "journal"]);
            result.archive = await read("migration_records", ["id", "source", "record"]);
        };
        if (lyz.DB) {
            try { await lyz.DB.executeTransaction(snapshot); }
            catch (error) { result.errors.push({ table: "snapshot", error: String(error) }); await snapshot(); }
        } else result.errors.push({ table: "connection", error: lyz.databaseStatus?.error || "No database connection" });
        var paths = new Map();
        for (var path of new Set(result.docs.flatMap(row => [row.doc, row.bib]).concat(result.keys.map(row => row.bib)))) {
            paths.set(path, await this.fileStatus(path));
        }
        for (var row of result.docs) {
            row.file = paths.get(row.doc);
            row.bibliography = paths.get(row.bib);
        }
        var bibPaths = new Set(result.docs.map(row => row.bib).concat(result.keys.map(row => row.bib)));
        result.bibs = Array.from(bibPaths).sort().map(bib => ({
            bib, file: paths.get(bib), documents: result.docs.filter(row => row.bib === bib).length,
            keys: result.keys.filter(row => row.bib === bib).length
        }));
        for (var row of result.keys) {
            var item = lyz.getZoteroItem(row.zid);
            row.itemState = item && !item.deleted ? "ok" : "missing";
            try { row.title = item?.getField("title") || ""; } catch (_) { row.title = ""; }
            row.file = paths.get(row.bib);
        }
        result.editable = !lyz.databaseBlocked && !lyz.recoveryRequired && !result.recovery.length && !result.errors.length;
        if (result.editable) {
            try { await LyZDatabase.assertMappingEditReady(lyz); }
            catch (error) { result.editable = false; result.errors.push({ table: "audit", error: String(error) }); }
        }
        return result;
    },

    async fingerprintFile(path) {
        var status = await this.fileStatus(path);
        if (status.state === "missing") return { path, hash: null };
        if (status.state !== "ok") throw this.error("file", { path });
        var bytes = await IOUtils.read(path);
        return { path, hash: LyZKeyUpdate.fingerprint(bytes), bytes };
    },

    async preview(lyz, request) {
        if (this.busy) throw this.error("blocked");
        await LyZDatabase.assertMappingEditReady(lyz);
        var snapshot;
        await lyz.DB.executeTransaction(async () => { snapshot = await LyZDatabase.getMappingSnapshot(lyz); });
        var { action, source, target } = request;
        if (!["relink-doc", "relink-bib", "delete-doc", "delete-bib"].includes(action) || typeof source !== "string") {
            throw this.error("selection");
        }
        var docAction = action.endsWith("-doc");
        var docs = snapshot.docs.filter(row => docAction ? row.doc === source : row.bib === source);
        var keys = docAction ? [] : snapshot.keys.filter(row => row.bib === source);
        if (!docs.length && !keys.length) throw this.error("stale");
        var files = [];
        var sourceMissing = false;
        if (action.startsWith("relink-")) {
            if (typeof target !== "string" || !PathUtils.isAbsolute(target)
                || !target.toLowerCase().endsWith(docAction ? ".lyx" : ".bib")) throw this.error("file", { path: target || "" });
            var candidate = await this.fingerprintFile(target);
            if (candidate.hash === null) throw this.error("file", { path: target });
            target = PathUtils.normalize(target);
            if (docAction && lyz.os === "Win") target = target.replace(/\\/g, "/");
            var normalized = this.normalize(target, lyz.os);
            if (normalized === this.normalize(source, lyz.os)) throw this.error("unchanged");
            var occupied = docAction ? snapshot.docs.map(row => row.doc)
                : snapshot.docs.map(row => row.bib).concat(snapshot.keys.map(row => row.bib));
            if (occupied.some(path => this.normalize(path, lyz.os) === normalized)) throw this.error("occupied", { path: target });
            var original = PathUtils.isAbsolute(source) ? await this.fingerprintFile(source) : { path: source, hash: null };
            sourceMissing = original.hash === null;
            if (!sourceMissing && original.hash !== candidate.hash) throw this.error("mismatch");
            if (docAction) {
                var text = LyZKeyUpdate.decode(candidate.bytes).replace(/^\uFEFF/, "");
                if (!/^#LyX\b/.test(text) || !/^\\begin_document\s*$/m.test(text) || !/^\\end_document\s*$/m.test(text)) {
                    throw this.error("file", { path: target });
                }
                try { LyZKeyUpdate.rewriteDocument(candidate.bytes, {}, {}); }
                catch (_) { throw this.error("file", { path: target }); }
            } else {
                try { var parsed = LyZKeyUpdate.parseBibliography(candidate.bytes, keys); }
                catch (_) { throw this.error("mismatch"); }
                if (parsed.zids.length !== keys.length || keys.some(row => parsed.oldkeys[row.key] !== row.zid)) {
                    throw this.error("mismatch");
                }
            }
            files = [original, { path: target, hash: candidate.hash }].filter(file => PathUtils.isAbsolute(file.path))
                .map(file => ({ path: file.path, hash: file.hash }));
        }
        var id = "mapping-" + Services.uuid.generateUUID().toString().replace(/[{}]/g, "");
        // Store the full plan privately; the window receives a separate summary.
        var plan = { id, action, source, target: target || null, docs, keys, snapshot, files };
        this.plans.set(id, plan);
        // Bound abandoned previews from repeated picker/search interactions.
        if (this.plans.size > 32) this.plans.delete(this.plans.keys().next().value);
        return { id, action, source, target: plan.target, documents: docs.length, keys: keys.length,
            affected: docs.map(row => row.doc), sourceMissing };
    },

    discard(id) {
        this.plans.delete(id);
    },

    async apply(lyz, id) {
        if (this.busy) throw this.error("blocked");
        var plan = this.plans.get(id);
        if (!plan) throw this.error("stale");
        this.busy = true;
        try {
            await LyZDatabase.applyMappingEdit(lyz, plan, async () => {
                for (var file of plan.files) {
                    if ((await this.fingerprintFile(file.path)).hash !== file.hash) throw this.error("stale");
                }
            });
            this.plans.clear();
            return true;
        } finally {
            this.busy = false;
            this.discard(id);
        }
    }
};
