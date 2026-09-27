// A read-only mapping snapshot; bibliography and document contents are never read.
var LyZDiagnostics = {
    async collect(lyz) {
        var report = {
            format: "lyz-database-diagnostics", version: 1, createdAt: new Date().toISOString(),
            supportedSchemaVersion: LyZDatabase.schemaVersion,
            startup: lyz.databaseStatus || null, databaseBlocked: !!lyz.databaseBlocked,
            recoveryRequired: !!lyz.recoveryRequired,
            databasePath: lyz.DB?.path || null,
            schemaVersion: null, integrity: null, schema: null, tables: {}, errors: []
        };
        var read = async (label, sql, columns) => {
            try {
                var rows = await lyz.DB.queryAsync(sql);
                return rows.map(row => {
                    var result = {};
                    for (var column of columns) result[column] = row[column];
                    return result;
                });
            } catch (error) {
                report.errors.push({ section: label, error: String(error) });
                return null;
            }
        };
        var snapshot = async () => {
            var versions = await read("schemaVersion", "PRAGMA user_version", ["user_version"]);
            report.schemaVersion = versions?.[0]?.user_version ?? null;
            report.integrity = await read("integrity", "PRAGMA integrity_check(100)", ["integrity_check"]);
            report.schema = await read("schema", "SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name",
                ["type", "name", "tbl_name", "sql"]);
            for (var table of Object.keys(LyZDatabase.tableColumns)) {
                // Preserve every readable column even when the schema is unexpected.
                var columns = await read(table + ".columns", "PRAGMA table_xinfo(" + table + ")",
                    ["cid", "name", "type", "notnull", "dflt_value", "pk", "hidden"]);
                report.tables[table] = {
                    columns,
                    rows: columns === null ? null : await read(table, "SELECT * FROM " + table, columns.map(row => row.name))
                };
            }
        };
        if (!lyz.DB) {
            report.errors.push({ section: "connection", error: "LyZ database connection is unavailable" });
        } else {
            try {
                await lyz.DB.executeTransaction(snapshot);
            } catch (error) {
                report.errors.push({ section: "snapshot", error: String(error) });
                // A damaged DB may reject BEGIN; individual reads can still recover useful evidence.
                await snapshot();
            }
        }
        return report;
    },

    protectedPaths(report) {
        var paths = new Set();
        if (report.databasePath) {
            for (var suffix of ["", "-wal", "-shm", "-journal"]) paths.add(report.databasePath + suffix);
        }
        for (var table of ["docs", "keys", "key_updates", "migration_records"]) {
            for (var row of report.tables[table]?.rows || []) {
                if (typeof row.doc === "string") paths.add(row.doc);
                if (typeof row.bib === "string") paths.add(row.bib);
                if (table === "migration_records") {
                    try {
                        var record = JSON.parse(row.record);
                        if (typeof record.doc === "string") paths.add(record.doc);
                        if (typeof record.bib === "string") paths.add(record.bib);
                    } catch (_) { /* Preserve malformed historical records too. */ }
                }
                if (table === "key_updates") {
                    try {
                        var journal = JSON.parse(row.journal);
                        for (var file of journal.files || []) {
                            for (var field of ["path", "backup", "tmp"]) {
                                if (typeof file[field] === "string") paths.add(file[field]);
                            }
                        }
                    } catch (_) { /* Raw journal is still included in the report. */ }
                }
            }
        }
        return paths;
    },

    async exportReport(lyz, path, report) {
        // Require a JSON filename so a picker cannot overwrite a LyX/BibTeX/SQLite file.
        if (!path.toLowerCase().endsWith(".json")) throw new Error("Diagnostics must be saved to a .json file");
        var normalize = value => {
            var normalized = value;
            try { normalized = PathUtils.normalize(value); }
            catch (_) {
                // New export files do not exist yet; normalize the existing parent.
                try { normalized = PathUtils.join(PathUtils.normalize(PathUtils.parent(value)), PathUtils.filename(value)); }
                catch (_) { /* Stale mapping paths are still compared as strings. */ }
            }
            if (lyz.os === "Win") normalized = normalized.replace(/\\/g, "/");
            return lyz.os === "Win" ? normalized.toLowerCase() : normalized;
        };
        if (!PathUtils.isAbsolute(path)) throw new Error("Diagnostics require an absolute output path");
        var target = normalize(path);
        if (Array.from(this.protectedPaths(report)).some(value => normalize(value) === target)) {
            throw new Error("Diagnostics cannot overwrite a file referenced by LyZ");
        }
        var tmpPath = path + ".lyz-diagnostics-" + Services.uuid.generateUUID().toString().replace(/[{}]/g, "") + ".tmp";
        try {
            await IOUtils.write(path, new TextEncoder().encode(JSON.stringify(report, null, 2) + "\n"), { tmpPath, flush: true });
        } finally {
            try { await IOUtils.remove(tmpPath, { ignoreAbsent: true }); }
            catch (error) { Zotero.logError(error); }
        }
    }
};
