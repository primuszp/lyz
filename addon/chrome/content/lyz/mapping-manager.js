var LyZMappingManager = {
    api: null, data: null, view: "docs", selected: null, plan: null, busy: false, page: 0, pageSize: 50,
    $(id) { return document.getElementById(id); },
    t(id, args) { return this.api.localize("lyz-manager-" + id, args); },

    async init(api) {
        this.api = api;
        document.title = this.t("title");
        for (var element of document.querySelectorAll("[data-string]")) element.textContent = api.localize(element.dataset.string);
        this.$("refresh").addEventListener("click", () => this.refresh());
        this.$("export").addEventListener("click", () => this.perform(() => api.export()));
        this.$("search").addEventListener("input", () => { this.page = 0; this.clearSelection(); this.render(); });
        this.$("problems").addEventListener("change", () => { this.page = 0; this.clearSelection(); this.render(); });
        for (let button of this.$("tabs").querySelectorAll("button")) {
            button.addEventListener("click", () => {
                this.view = button.dataset.view; this.page = 0; this.clearSelection(); this.render();
            });
        }
        this.$("previous").addEventListener("click", () => { this.page--; this.clearSelection(); this.render(); });
        this.$("next").addEventListener("click", () => { this.page++; this.clearSelection(); this.render(); });
        this.$("relink").addEventListener("click", () => this.preview(true));
        this.$("remove").addEventListener("click", () => this.preview(false));
        this.$("cancel").addEventListener("click", () => this.clearPreview());
        this.$("acknowledge").addEventListener("change", () => this.updateActions());
        this.$("apply").addEventListener("click", () => this.apply());
        window.addEventListener("unload", () => this.clearPreview());
        await this.refresh();
    },

    message(text, error = false) {
        this.$("message").hidden = !text;
        this.$("message").textContent = text;
        this.$("message").className = error ? "error" : "";
    },

    async perform(action) {
        if (this.busy) return;
        this.busy = true;
        this.message("");
        this.updateActions();
        try { return await action(); }
        catch (error) { this.message(String(error.message || error), true); }
        finally { this.busy = false; this.updateActions(); }
    },

    async refresh() {
        return this.perform(async () => {
            this.clearSelection();
            this.data = await this.api.inventory();
            this.render();
        });
    },

    fold(text) { return String(text).normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase(); },

    records() {
        var query = this.fold(this.$("search").value).trim();
        var problems = this.$("problems").checked;
        return (this.data?.[this.view] || []).filter(row => {
            var issue = this.view === "recovery" || row.file?.state !== undefined && row.file.state !== "ok"
                || row.bibliography?.state !== undefined && row.bibliography.state !== "ok" || row.itemState === "missing";
            return (!query || this.fold(JSON.stringify(row)).includes(query)) && (!problems || issue);
        });
    },

    element(tag, text, className) {
        var element = document.createElementNS("http://www.w3.org/1999/xhtml", tag);
        if (text !== undefined) element.textContent = String(text);
        if (className) element.className = className;
        return element;
    },

    status(state) {
        return this.element("span", this.t("state-" + state), "state" + (state !== "ok" ? " problem" : ""));
    },

    columns(row) {
        switch (this.view) {
            case "docs": return [row.doc, row.bib, this.status(row.file.state), this.status(row.bibliography.state)];
            case "bibs": return [row.bib, row.documents, row.keys, this.status(row.file.state)];
            case "keys": return [row.title || row.zid, row.zid, row.key, row.bib,
                this.status(row.itemState === "missing" ? "item-missing" : row.file.state)];
            case "recovery": return [row.bib, this.t("state-" + row.state), row.id, this.details(row.journal)];
            case "archive":
                var original;
                try { original = JSON.parse(row.record) || {}; } catch (_) { original = {}; }
                return [row.source === "docs" ? this.t("docs") : row.source === "keys" ? this.t("keys") : row.source,
                    original.doc || original.bib || "—", original.key || "—", this.details(row.record)];
        }
    },

    details(text) {
        var details = this.element("details");
        details.append(this.element("summary", this.t("details")), this.element("pre", text));
        return details;
    },

    render() {
        if (!this.data) return;
        var data = this.data;
        this.$("mode").textContent = this.t(data.editable ? "ready" : "readonly")
            + (data.errors.length ? "\n" + data.errors.map(row => row.table + ": " + row.error).join("\n") : "");
        this.$("mode").className = "notice" + (data.editable ? "" : " warning");
        for (var button of this.$("tabs").querySelectorAll("button")) {
            button.textContent = this.t(button.dataset.view) + " (" + data[button.dataset.view].length + ")";
            button.setAttribute("aria-pressed", String(this.view === button.dataset.view));
        }
        var headers = {
            docs: ["document", "bibliography", "file-status", "bib-status"],
            bibs: ["bibliography", "documents", "citation-keys", "file-status"],
            keys: ["item", "zid", "key", "bibliography", "status"],
            recovery: ["bibliography", "status", "identifier", "details"],
            archive: ["record-type", "original-path", "key", "details"]
        }[this.view];
        var head = this.element("tr");
        head.append(this.element("th", ""));
        for (var header of headers) head.append(this.element("th", this.t(header)));
        this.$("head").replaceChildren(head);
        var records = this.records();
        this.page = Math.max(0, Math.min(this.page, Math.ceil(records.length / this.pageSize) - 1));
        var start = this.page * this.pageSize;
        this.$("rows").replaceChildren();
        for (let row of records.slice(start, start + this.pageSize)) {
            var tr = this.element("tr");
            var select = this.element("td");
            if (["docs", "bibs"].includes(this.view)) {
                var input = this.element("input");
                input.type = "radio"; input.name = "record-selection";
                input.setAttribute("aria-label", this.t("select-record", { path: row.doc || row.bib }));
                input.checked = this.selected === row;
                input.disabled = this.busy;
                input.addEventListener("change", () => {
                    this.clearPreview(); this.selected = row; this.render();
                    for (var current of this.$("rows").querySelectorAll("input")) if (current.checked) current.focus();
                });
                select.append(input);
            }
            tr.append(select);
            if (this.selected === row) tr.className = "selected";
            for (var value of this.columns(row)) {
                var td = this.element("td");
                if (value && typeof value === "object") td.append(value);
                else td.textContent = String(value ?? "");
                tr.append(td);
            }
            this.$("rows").append(tr);
        }
        if (!records.length) {
            var empty = this.element("td", this.t("empty")); empty.colSpan = headers.length + 1;
            var tr = this.element("tr"); tr.append(empty); this.$("rows").append(tr);
        }
        this.$("count").textContent = this.t("count", { first: records.length ? start + 1 : 0,
            last: Math.min(start + this.pageSize, records.length), total: records.length });
        this.$("previous").disabled = this.busy || this.page === 0;
        this.$("next").disabled = this.busy || start + this.pageSize >= records.length;
        this.$("selection").textContent = this.selected ? this.selected.doc || this.selected.bib : this.t("select");
        this.updateActions();
    },

    updateActions() {
        var editable = this.data?.editable && this.selected && ["docs", "bibs"].includes(this.view) && !this.busy;
        this.$("relink").disabled = !editable;
        this.$("remove").disabled = !editable;
        this.$("apply").disabled = this.busy || !this.plan || !this.$("acknowledge").checked || !this.data?.editable;
        for (var id of ["refresh", "export", "search", "problems", "cancel", "acknowledge"]) this.$(id).disabled = this.busy;
        for (var button of this.$("tabs").querySelectorAll("button")) button.disabled = this.busy;
        for (var input of this.$("rows").querySelectorAll("input")) input.disabled = this.busy;
        var total = this.records().length;
        this.$("previous").disabled = this.busy || this.page === 0;
        this.$("next").disabled = this.busy || (this.page + 1) * this.pageSize >= total;
    },

    clearPreview() {
        if (this.plan) this.api.discard(this.plan.id);
        this.plan = null;
        this.$("preview").hidden = true;
        this.$("acknowledge").checked = false;
        this.updateActions();
    },

    clearSelection() { this.clearPreview(); this.selected = null; },

    async preview(relink) {
        if (!this.selected || !this.data?.editable) return;
        return this.perform(async () => {
            this.clearPreview();
            var target = relink ? await this.api.chooseFile(this.view, window) : null;
            if (relink && !target) return;
            this.plan = await this.api.preview({ action: (relink ? "relink-" : "delete-") + (this.view === "docs" ? "doc" : "bib"),
                source: this.selected.doc || this.selected.bib, target });
            if (!this.plan) throw new Error(this.t("error-blocked"));
            this.$("preview-action").textContent = this.t(this.plan.action);
            this.$("preview-source").textContent = this.plan.source;
            this.$("preview-target").textContent = this.plan.target || this.t("removed");
            this.$("preview-counts").textContent = this.t("affected-count", { documents: this.plan.documents, keys: this.plan.keys });
            this.$("affected").replaceChildren(...this.plan.affected.map(path => this.element("li", path)));
            this.$("preview-warning").textContent = this.t(relink ? "relink-warning" : "remove-warning")
                + (this.plan.sourceMissing ? "\n" + this.t("source-missing") : "");
            this.$("preview").hidden = false;
            this.$("preview").scrollIntoView({ block: "nearest" });
        });
    },

    async apply() {
        if (!this.plan || !this.$("acknowledge").checked || !this.data?.editable) return;
        return this.perform(async () => {
            var id = this.plan.id;
            try {
                if (!await this.api.apply(id)) throw new Error(this.t("error-blocked"));
                this.message(this.t("saved"));
            } finally {
                this.clearSelection();
                this.data = await this.api.inventory();
                this.render();
            }
        });
    }
};

window.addEventListener("load", () => {
    var api = window.arguments?.[0];
    if (api) LyZMappingManager.init(api).catch(error => LyZMappingManager.message(String(error), true));
});
