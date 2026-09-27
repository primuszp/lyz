var LyZDatabase = {
    schemaVersion: 1,
    tableColumns: {
        docs: ["id", "doc", "bib"],
        keys: ["id", "key", "bib", "zid"],
        key_updates: ["id", "bib", "state", "journal"],
        migration_records: ["id", "source", "record"]
    },

    async init(lyz) {
        lyz.databaseBlocked = true;
        lyz.databaseStatus = { stage: "open", version: null, integrity: [], error: null };
        try {
            if (!lyz.DB) lyz.DB = new Zotero.DBConnection("lyz");
            var status = lyz.databaseStatus;
            status.stage = "integrity";
            status.integrity = await this.checkIntegrity(lyz);
            status.stage = "schema";
            var versions = await lyz.DB.queryAsync("PRAGMA user_version");
            status.version = versions[0].user_version;
            if (!Number.isInteger(status.version) || status.version < 0 || status.version > this.schemaVersion) {
                throw new Error("Unsupported LyZ database schema version: " + status.version);
            }
            if (lyz.DB.readOnly) throw new Error("LyZ database connection is read-only");
            if (status.version === 0) {
                status.stage = "migration";
                await this.migrateUnversioned(lyz);
                status.version = this.schemaVersion;
            }
            status.stage = "schema";
            await this.validateSchema(lyz, false);
            await this.validateRecords(lyz);
            status.stage = "ready";
            lyz.databaseBlocked = false;
            return true;
        } catch (error) {
            lyz.databaseStatus.error = String(error);
            if (Zotero.logError) Zotero.logError(error);
            return false;
        }
    },

    assertWritable(lyz) {
        if (lyz.databaseBlocked) throw new Error("LyZ database changes are blocked: " + lyz.databaseStatus?.error);
    },

    async checkIntegrity(lyz) {
        var rows = await lyz.DB.queryAsync("PRAGMA integrity_check(100)");
        var results = rows.map(row => row.integrity_check);
        lyz.databaseStatus.integrity = results;
        if (results.length !== 1 || results[0] !== "ok") {
            throw new Error("SQLite integrity check failed: " + results.join("; "));
        }
        return results;
    },

    async validateSchema(lyz, legacy) {
        var objects = await lyz.DB.queryAsync("SELECT type,name,tbl_name FROM sqlite_master");
        for (var table of Object.keys(this.tableColumns)) {
            var object = objects.find(row => row.name === table);
            if (!object && legacy) continue;
            if (!object || object.type !== "table") throw new Error("Missing or invalid table: " + table);
            var columns = await lyz.DB.queryAsync("PRAGMA table_xinfo(" + table + ")");
            var expected = this.tableColumns[table];
            if (columns.length !== expected.length || columns.some((row, index) =>
                row.name !== expected[index] || row.type.toUpperCase() !== (index === 0 && table !== "key_updates" ? "INTEGER" : "TEXT")
                || row.pk !== (index === 0 ? 1 : 0) || row.hidden !== 0
                || ((table === "key_updates" || table === "migration_records") && index > 0 && row.notnull !== 1))) {
                throw new Error("Unexpected columns in table: " + table);
            }
            if (objects.some(row => row.type === "trigger" && row.tbl_name === table)) {
                throw new Error("Unexpected database trigger on table: " + table);
            }
        }
        for (var [table, name, unique, expected] of [
            ["docs", "docs_doc_unique", 1, ["doc"]],
            ["keys", "keys_bib_zid_unique", 1, ["bib", "zid"]],
            ["keys", "keys_bib_key_idx", 0, ["bib", "key"]]
        ]) {
            var object = objects.find(row => row.name === name);
            if (!object && legacy) continue;
            var indexes = await lyz.DB.queryAsync("PRAGMA index_list(" + table + ")");
            var index = indexes.find(row => row.name === name);
            var columns = (await lyz.DB.queryAsync("PRAGMA index_xinfo(" + name + ")")).filter(row => row.key === 1);
            if (!index || index.unique !== unique || index.partial !== 0
                || columns.length !== expected.length || columns.some((row, i) => row.name !== expected[i]
                    || row.coll !== "BINARY" || row.desc !== 0)) {
                throw new Error("Missing or invalid index: " + name);
            }
        }
        if (objects.some(row => row.name === "key_updates")) {
            var indexes = await lyz.DB.queryAsync("PRAGMA index_list(key_updates)");
            var uniqueBib = false;
            for (var index of indexes.filter(row => row.unique === 1 && row.partial === 0)) {
                // SQLite-generated names are obtained from metadata, not user input.
                var columns = (await lyz.DB.queryAsync("PRAGMA index_xinfo('" + index.name.replace(/'/g, "''") + "')"))
                    .filter(row => row.key === 1);
                if (columns.length === 1 && columns[0].name === "bib" && columns[0].coll === "BINARY") uniqueBib = true;
            }
            if (!uniqueBib) throw new Error("Missing unique bibliography constraint in key_updates");
        }
    },

    async validateRecords(lyz) {
        for (var [table, fields] of [["docs", ["doc", "bib"]], ["keys", ["key", "bib", "zid"]]]) {
            var condition = fields.map(field => "typeof(" + field + ") <> 'text' OR trim(" + field + ") = ''").join(" OR ");
            var invalid = await lyz.DB.queryAsync("SELECT id FROM " + table + " WHERE " + condition + " LIMIT 1");
            if (invalid.length) throw new Error("Invalid mapping in " + table + ", row " + invalid[0].id);
        }
        var invalid = await lyz.DB.queryAsync("SELECT id FROM key_updates WHERE " +
            "typeof(id) <> 'text' OR trim(id) = '' OR typeof(bib) <> 'text' OR trim(bib) = '' " +
            "OR state NOT IN ('prepared','committed') OR typeof(journal) <> 'text' LIMIT 1");
        if (invalid.length) throw new Error("Invalid key-update record: " + invalid[0].id);
    },

    async migrateUnversioned(lyz) {
        // All changes, including the version flag and duplicate archives, commit together.
        await lyz.DB.executeTransaction(async () => {
            await this.validateSchema(lyz, true);
            await lyz.DB.queryAsync("CREATE TABLE IF NOT EXISTS docs (id INTEGER PRIMARY KEY, doc TEXT, bib TEXT)");
            await lyz.DB.queryAsync("CREATE TABLE IF NOT EXISTS keys (id INTEGER PRIMARY KEY, key TEXT, bib TEXT, zid TEXT)");
            await lyz.DB.queryAsync("CREATE TABLE IF NOT EXISTS key_updates (" +
                "id TEXT PRIMARY KEY, bib TEXT NOT NULL UNIQUE, " +
                "state TEXT NOT NULL CHECK(state IN ('prepared','committed')), journal TEXT NOT NULL)");
            await lyz.DB.queryAsync("CREATE TABLE IF NOT EXISTS migration_records (" +
                "id INTEGER PRIMARY KEY, source TEXT NOT NULL, record TEXT NOT NULL)");
            await this.validateRecords(lyz);
            var pending = await this.listKeyUpdates(lyz);
            for (var table of ["docs", "keys"]) {
                var group = table === "docs" ? "doc" : "bib,zid";
                var condition = "id NOT IN (SELECT MAX(id) FROM " + table + " GROUP BY " + group + ")";
                var duplicates = await lyz.DB.queryAsync("SELECT * FROM " + table + " WHERE " + condition + " ORDER BY id");
                if (pending.length && duplicates.length) {
                    throw new Error("Pending key update prevents consolidation of duplicate mappings");
                }
                for (var row of duplicates) {
                    // Zotero storage rows are proxies; read columns explicitly.
                    var record = {};
                    for (var field of this.tableColumns[table]) record[field] = row[field];
                    await lyz.DB.queryAsync("INSERT INTO migration_records (source,record) VALUES (?,?)", [table, JSON.stringify(record)]);
                }
                await lyz.DB.queryAsync("DELETE FROM " + table + " WHERE " + condition);
            }
            await lyz.DB.queryAsync("CREATE UNIQUE INDEX IF NOT EXISTS docs_doc_unique ON docs(doc)");
            await lyz.DB.queryAsync("CREATE UNIQUE INDEX IF NOT EXISTS keys_bib_zid_unique ON keys(bib,zid)");
            await lyz.DB.queryAsync("CREATE INDEX IF NOT EXISTS keys_bib_key_idx ON keys(bib,key)");
            await this.validateSchema(lyz, false);
            await lyz.DB.queryAsync("PRAGMA user_version = 1");
        });
    },

    async close(lyz) {
        if (lyz.DB) {
            await lyz.DB.closeDatabase(true);
            lyz.DB = null;
        }
    },

    async getDocumentRecord(lyz, doc) {
        return lyz.DB.queryAsync("SELECT doc,bib FROM docs WHERE doc = ?", [doc]);
    },

    async addDocument(lyz, doc, bib) {
        this.assertWritable(lyz);
        await lyz.DB.queryAsync(
            "INSERT INTO docs (doc,bib) VALUES(?,?) " +
            "ON CONFLICT(doc) DO UPDATE SET bib=excluded.bib",
            [doc, bib]
        );
    },

    async setDocumentBib(lyz, doc, bib) {
        await this.addDocument(lyz, doc, bib);
    },

    async clearKeysForBib(lyz, bib) {
        this.assertWritable(lyz);
        await lyz.DB.queryAsync("DELETE FROM keys WHERE bib=?", [bib]);
    },

    async findKey(lyz, bib, zid) {
        return lyz.DB.queryAsync("SELECT key FROM keys WHERE bib=? AND zid=?", [bib, zid]);
    },

    async insertKey(lyz, key, bib, zid) {
        this.assertWritable(lyz);
        await lyz.DB.queryAsync(
            "INSERT INTO keys (key,bib,zid) VALUES(?,?,?) " +
            "ON CONFLICT(bib,zid) DO UPDATE SET key=excluded.key",
            [key, bib, zid]
        );
    },

    async findConflictingKey(lyz, bib, key, zid) {
        return lyz.DB.queryAsync("SELECT key,zid FROM keys WHERE bib=? AND key=? AND zid<>?", [bib, key, zid]);
    },

    async getKeysForBib(lyz, bib) {
        return lyz.DB.queryAsync("SELECT zid,key FROM keys WHERE bib=?", [bib]);
    },

    async getDocumentsForBib(lyz, bib) {
        return lyz.DB.queryAsync("SELECT doc FROM docs WHERE bib=? ORDER BY doc", [bib]);
    },

    async beginKeyUpdate(lyz, id, bib, journal) {
        this.assertWritable(lyz);
        await lyz.DB.executeTransaction(async () => {
            journal.oldKeys = Object.create(null);
            for (var row of await this.getKeysForBib(lyz, bib)) journal.oldKeys[row.zid] = row.key;
            await lyz.DB.queryAsync(
                "INSERT INTO key_updates (id,bib,state,journal) VALUES (?,?,'prepared',?)",
                [id, bib, JSON.stringify(journal)]
            );
        });
    },

    async listKeyUpdates(lyz) {
        return lyz.DB.queryAsync("SELECT id,bib,state,journal FROM key_updates ORDER BY id");
    },

    async finishKeyUpdate(lyz, id) {
        this.assertWritable(lyz);
        await lyz.DB.queryAsync("DELETE FROM key_updates WHERE id=?", [id]);
    },

    async replaceKeysForBib(lyz, bib, keys, updateID = null) {
        this.assertWritable(lyz);
        await lyz.DB.executeTransaction(async () => {
            if (updateID) {
                var updates = await lyz.DB.queryAsync(
                    "SELECT id FROM key_updates WHERE id=? AND bib=? AND state='prepared'", [updateID, bib]
                );
                if (updates.length !== 1) throw new Error("Missing prepared key-update journal");
            }
            await this.clearKeysForBib(lyz, bib);
            for (var zid of Object.keys(keys)) {
                await this.insertKey(lyz, keys[zid], bib, zid);
            }
            if (updateID) {
                await lyz.DB.queryAsync("UPDATE key_updates SET state='committed' WHERE id=?", [updateID]);
            }
        });
    },

    async updateKey(lyz, key, zid, bib) {
        this.assertWritable(lyz);
        await lyz.DB.queryAsync("UPDATE keys SET key=? WHERE zid=? AND bib=?", [key, zid, bib]);
    },

    async findKeyRecord(lyz, zid, bib) {
        return lyz.DB.queryAsync("SELECT * FROM keys WHERE zid=? AND bib=?", [zid, bib]);
    },

    async listBibs(lyz) {
        return lyz.DB.queryAsync(
            "SELECT bib FROM docs WHERE bib IS NOT NULL AND bib <> '' " +
            "UNION SELECT bib FROM keys WHERE bib IS NOT NULL AND bib <> '' ORDER BY bib"
        );
    },

    async listDocuments(lyz) {
        return lyz.DB.queryAsync("SELECT doc FROM docs");
    },

    async listDocumentRecords(lyz) {
        return lyz.DB.queryAsync("SELECT id,doc FROM docs");
    },

    async getMappingSnapshot(lyz) {
        var snapshot = { docs: [], keys: [] };
        for (var table of ["docs", "keys"]) {
            for (var row of await lyz.DB.queryAsync("SELECT * FROM " + table + " ORDER BY id")) {
                var record = {};
                for (var field of this.tableColumns[table]) record[field] = row[field];
                snapshot[table].push(record);
            }
        }
        return snapshot;
    },

    async assertMappingEditReady(lyz) {
        this.assertWritable(lyz);
        var version = await lyz.DB.queryAsync("PRAGMA user_version");
        if (lyz.DB.readOnly || version[0].user_version !== this.schemaVersion) {
            throw new Error(LyZLocale.getString("lyz-manager-error-blocked"));
        }
        await this.validateSchema(lyz, false);
        await this.validateRecords(lyz);
        if (lyz.recoveryRequired || (await this.listKeyUpdates(lyz)).length) {
            throw new Error(LyZLocale.getString("lyz-manager-error-blocked"));
        }
    },

    async applyMappingEdit(lyz, plan, verifyFiles) {
        await lyz.DB.executeTransaction(async () => {
            await this.assertMappingEditReady(lyz);
            if (JSON.stringify(await this.getMappingSnapshot(lyz)) !== JSON.stringify(plan.snapshot)) {
                throw new Error(LyZLocale.getString("lyz-manager-error-stale"));
            }
            await verifyFiles();
            // Archive complete original rows before changing any active mapping.
            var savedAt = new Date().toISOString();
            for (var [table, records] of [["docs", plan.docs], ["keys", plan.keys]]) {
                for (var record of records) {
                    await lyz.DB.queryAsync("INSERT INTO migration_records (source,record) VALUES (?,?)", [table,
                        JSON.stringify({ ...record, savedAt, operation: plan.action, operationID: plan.id })]);
                }
            }
            switch (plan.action) {
                case "relink-doc":
                    await lyz.DB.queryAsync("UPDATE docs SET doc=? WHERE doc=?", [plan.target, plan.source]);
                    break;
                case "relink-bib":
                    await lyz.DB.queryAsync("UPDATE docs SET bib=? WHERE bib=?", [plan.target, plan.source]);
                    await lyz.DB.queryAsync("UPDATE keys SET bib=? WHERE bib=?", [plan.target, plan.source]);
                    break;
                case "delete-doc":
                    await lyz.DB.queryAsync("DELETE FROM docs WHERE doc=?", [plan.source]);
                    break;
                case "delete-bib":
                    await lyz.DB.queryAsync("DELETE FROM docs WHERE bib=?", [plan.source]);
                    await lyz.DB.queryAsync("DELETE FROM keys WHERE bib=?", [plan.source]);
                    break;
                default: throw new Error("Unsupported mapping action");
            }
        });
    },

    async deleteBib(lyz, bib) {
        this.assertWritable(lyz);
        await lyz.DB.executeTransaction(async () => {
            await lyz.DB.queryAsync("DELETE FROM docs WHERE bib=?", [bib]);
            await lyz.DB.queryAsync("DELETE FROM keys WHERE bib=?", [bib]);
        });
    },

    async deleteDocument(lyz, doc) {
        this.assertWritable(lyz);
        await lyz.DB.queryAsync("DELETE FROM docs WHERE doc=?", [doc]);
    },

    async renameDocument(lyz, newDoc, oldDoc) {
        this.assertWritable(lyz);
        await lyz.DB.executeTransaction(async () => {
            await lyz.DB.queryAsync(
                "INSERT INTO docs (doc,bib) SELECT ?,bib FROM docs WHERE doc=? " +
                "ON CONFLICT(doc) DO UPDATE SET bib=excluded.bib",
                [newDoc, oldDoc]
            );
            if (newDoc !== oldDoc) {
                await lyz.DB.queryAsync("DELETE FROM docs WHERE doc=?", [oldDoc]);
            }
        });
    },

    async renameBib(lyz, newBib, oldBib) {
        this.assertWritable(lyz);
        await lyz.DB.executeTransaction(async () => {
            await lyz.DB.queryAsync("UPDATE docs SET bib=? WHERE bib=?", [newBib, oldBib]);
            await lyz.DB.queryAsync(
                "INSERT INTO keys (key,bib,zid) SELECT key,?,zid FROM keys WHERE bib=? " +
                "ON CONFLICT(bib,zid) DO UPDATE SET key=excluded.key",
                [newBib, oldBib]
            );
            await lyz.DB.queryAsync("DELETE FROM keys WHERE bib=?", [oldBib]);
        });
    },

    async listLegacyZoteroKeys(lyz) {
        return lyz.DB.queryAsync("SELECT key FROM keys WHERE zid GLOB '0_*'");
    },

    async listLegacyZoteroKeyRecords(lyz) {
        return lyz.DB.queryAsync("SELECT key,bib,zid FROM keys WHERE zid GLOB '0_*'");
    },

    async findMigrationConflicts(lyz, zid, bib) {
        return lyz.DB.queryAsync("SELECT key FROM keys WHERE zid=? AND bib=?", [zid, bib]);
    },

    async deleteKeyForZidAndBib(lyz, zid, bib) {
        this.assertWritable(lyz);
        await lyz.DB.queryAsync("DELETE FROM keys WHERE zid=? AND bib=?", [zid, bib]);
    },

    async updateMigratedKey(lyz, newZid, newKey, oldZid, oldKey, bib) {
        this.assertWritable(lyz);
        await lyz.DB.queryAsync(
            "UPDATE keys SET zid=?, key=? WHERE zid=? AND key=? AND bib=?",
            [newZid, newKey, oldZid, oldKey, bib]
        );
    }
};
