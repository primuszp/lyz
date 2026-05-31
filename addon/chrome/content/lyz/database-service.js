var LyZDatabase = {
    async init(lyz) {
        lyz.DB = new Zotero.DBConnection("lyz");
        await lyz.DB.queryAsync("CREATE TABLE IF NOT EXISTS docs (id INTEGER PRIMARY KEY, doc TEXT, bib TEXT)");
        await lyz.DB.queryAsync("CREATE TABLE IF NOT EXISTS keys (id INTEGER PRIMARY KEY, key TEXT, bib TEXT, zid TEXT)");
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
        await lyz.DB.queryAsync("INSERT INTO docs (doc,bib) VALUES(?,?)", [doc, bib]);
    },

    async setDocumentBib(lyz, doc, bib) {
        var existing = await this.getDocumentRecord(lyz, doc);
        if (existing.length === 0) {
            await this.addDocument(lyz, doc, bib);
            return;
        }
        await lyz.DB.queryAsync("UPDATE docs SET bib=? WHERE doc=?", [bib, doc]);
    },

    async clearKeysForBib(lyz, bib) {
        await lyz.DB.queryAsync("DELETE FROM keys WHERE bib=?", [bib]);
    },

    async findKey(lyz, bib, zid) {
        return lyz.DB.queryAsync("SELECT key FROM keys WHERE bib=? AND zid=?", [bib, zid]);
    },

    async insertKey(lyz, key, bib, zid) {
        await lyz.DB.queryAsync("INSERT INTO keys VALUES(null,?,?,?)", [key, bib, zid]);
    },

    async findConflictingKey(lyz, bib, key, zid) {
        return lyz.DB.queryAsync("SELECT key,zid FROM keys WHERE bib=? AND key=? AND zid<>?", [bib, key, zid]);
    },

    async getKeysForBib(lyz, bib) {
        return lyz.DB.queryAsync("SELECT zid,key FROM keys WHERE bib=? GROUP BY zid", [bib]);
    },

    async updateKey(lyz, key, zid, bib) {
        await lyz.DB.queryAsync("UPDATE keys SET key=? WHERE zid=? AND bib=?", [key, zid, bib]);
    },

    async findKeyRecord(lyz, zid, bib) {
        return lyz.DB.queryAsync("SELECT * FROM keys WHERE zid=? AND bib=?", [zid, bib]);
    },

    async listBibsFromKeys(lyz) {
        return lyz.DB.queryAsync("SELECT bib FROM keys GROUP BY bib");
    },

    async listDocuments(lyz) {
        return lyz.DB.queryAsync("SELECT doc FROM docs");
    },

    async listDocumentRecords(lyz) {
        return lyz.DB.queryAsync("SELECT id,doc FROM docs");
    },

    async listDistinctBibs(lyz) {
        return lyz.DB.queryAsync("SELECT DISTINCT bib FROM docs");
    },

    async deleteBib(lyz, bib) {
        await lyz.DB.queryAsync("DELETE FROM docs WHERE bib=?", [bib]);
        await lyz.DB.queryAsync("DELETE FROM keys WHERE bib=?", [bib]);
    },

    async deleteDocument(lyz, doc) {
        await lyz.DB.queryAsync("DELETE FROM docs WHERE doc=?", [doc]);
    },

    async renameDocument(lyz, newDoc, oldDoc) {
        await lyz.DB.queryAsync("UPDATE docs SET doc=? WHERE doc=?", [newDoc, oldDoc]);
    },

    async renameBib(lyz, newBib, oldBib) {
        await lyz.DB.queryAsync("UPDATE docs SET bib=? WHERE bib=?", [newBib, oldBib]);
        await lyz.DB.queryAsync("UPDATE keys SET bib=? WHERE bib=?", [newBib, oldBib]);
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
        await lyz.DB.queryAsync("DELETE FROM keys WHERE zid=? AND bib=?", [zid, bib]);
    },

    async updateMigratedKey(lyz, newZid, newKey, oldZid, oldKey, bib) {
        await lyz.DB.queryAsync(
            "UPDATE keys SET zid=?, key=? WHERE zid=? AND key=? AND bib=?",
            [newZid, newKey, oldZid, oldKey, bib]
        );
    }
};
