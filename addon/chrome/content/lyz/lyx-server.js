var LyZServer = {
    requestID: 0,
    responseTimeoutMS: 2500,

    getPipePath(lyz) {
        if (typeof LyZSettings !== "undefined") {
            var path = LyZSettings.getCharPref("lyxserver", LyZSettings.getDefaultLyXServerPath());
            return LyZSettings.detectLyXServerPath(path);
        }
        return lyz.prefs.getCharPref("lyxserver");
    },

    alert(message, title = LyZLocale.getString("lyz-server-title")) {
        Services.prompt.alert(null, title, message);
    },

    // Transport failures become modal alerts unless the caller collects them itself.
    report(options, message) {
        if (options && typeof options.onError === "function") {
            options.onError(message);
        } else {
            this.alert(message);
        }
    },

    /**
     * Checks the configured LyXServer without modal dialogs.
     * Resolves to { state, path, document?, detail? } where state is one of
     * "ok", "no-document", "missing-pipe", "no-response", "error".
     */
    async probe(lyz) {
        var result = {};
        try {
            result.path = this.getPipePath(lyz);
            var command = "server-get-filename";
            // Use the bounded worker transport directly: probing must never
            // open a modal alert or use synchronous native pipe I/O.
            var response = await this.writeAndRead(lyz, command, { requireResponse: true });
            if (!response || response === true) {
                return Object.assign(result, { state: "no-response" });
            }
            var document = this.parseResponse(command, response);
            if (document === null) {
                return Object.assign(result, { state: "error", detail: response });
            }
            return Object.assign(result, document ? { state: "ok", document } : { state: "no-document" });
        } catch (error) {
            var state = error.code === "missing-pipe" ? "missing-pipe"
                : error.code === "timeout" ? "no-response" : "error";
            return Object.assign(result, { state, detail: String(error) });
        }
    },

    debug(message) {
        if (typeof Zotero !== "undefined" && Zotero.debug) {
            Zotero.debug("LyZ server: " + message);
        } else if (typeof Services !== "undefined" && Services.console) {
            Services.console.logStringMessage("LyZ server: " + message);
        }
    },

    createClientID() {
        this.requestID += 1;
        if (!this.sessionID) this.sessionID = Services.uuid.generateUUID().toString().replace(/[^a-zA-Z0-9]/g, "");
        return "lyz" + this.sessionID + "_" + this.requestID;
    },

    expectsResponse(command) {
        return command == "server-get-filename" || command == "server-get-xy";
    },

    async getDocument(lyz) {
        var res, fname;
        if (lyz.os == "Win") {
            res = await this.askServer(lyz, "server-get-filename");
        } else {
            res = await this.askServerWithOpenStream(lyz, "server-get-filename");
        }
        if (!res) {
            this.alert(LyZLocale.getString("lyz-server-no-contact", { path: this.getPipePath(lyz) }));
            return null;
        }

        fname = this.parseResponse("server-get-filename", res);
        if (fname === null) {
            this.alert(LyZLocale.getString("lyz-server-error", { response: res }));
            return null;
        }
        if (!fname) {
            this.alert(LyZLocale.getString("lyz-server-no-filename"));
            return null;
        }
        return fname;
    },

    getPosition(lyz) {
        return this.requireCommand(lyz, "server-get-xy");
    },

    parseResponse(command, response) {
        if (!response || typeof response !== "string") {
            return null;
        }
        return this.parseResponseForClient(null, command, response);
    },

    parseResponseForClient(clientID, command, response) {
        if (!response || typeof response !== "string") {
            return null;
        }
        var escapedClient = clientID ? clientID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "[^:]+";
        var escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        var re = new RegExp("^INFO:" + escapedClient + ":" + escapedCommand + ":([^\\r\\n]*)", "gm");
        var match;
        var value = null;
        while ((match = re.exec(response)) !== null) {
            value = match[1].trim();
        }
        return value;
    },

    extractClientResponse(clientID, command, response) {
        if (!response || typeof response !== "string") return null;
        var escapedClient = clientID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        var escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        var expression = new RegExp("^(?:INFO|ERROR):" + escapedClient + ":"
            + escapedCommand + ":[^\\r\\n]*", "gm");
        var matches = response.match(expression);
        return matches ? matches[matches.length - 1].trim() : null;
    },

    async requireCommand(lyz, command) {
        var options = { requireResponse: true };
        var response = await this.writeAndRead(lyz, command, options);
        var name = command.split(":")[0];
        var value = this.parseResponse(name, response);
        if (value === null) {
            var error = new Error("LyX command failed: " + command + " (" + (response || "no response") + ")");
            error.code = typeof response === "string" && response.startsWith("ERROR:") ? "lyx-error" : "invalid-response";
            error.stage = "response";
            throw error;
        }
        return value;
    },

    // One canonical transport for Windows named pipes and Unix FIFOs.
    createWorker() {
        if (typeof ChromeWorker !== "undefined") return new ChromeWorker("chrome://lyz/content/lyx-pipe-worker.js");
        return Components.classes["@mozilla.org/threads/workerfactory;1"]
            .createInstance(Components.interfaces.nsIWorkerFactory)
            .newChromeWorker("chrome://lyz/content/lyx-pipe-worker.js");
    },

    startTimer(callback, milliseconds) {
        var timer = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
        timer.initWithCallback(callback, milliseconds, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
        return timer;
    },

    transportError(code, stage, detail) {
        var error = new Error("LyX transport " + code + " at " + stage + (detail ? ": " + detail : ""));
        error.code = code; error.stage = stage;
        return error;
    },

    async request(lyz, command, options) {
        if (/[\r\n]/.test(command)) throw this.transportError("invalid-command", "write", "Line breaks are not allowed");
        var path = this.getPipePath(lyz);
        var clientID = this.createClientID();
        var name = command.split(":")[0];
        var started = Date.now();
        var timeout = this.responseTimeoutMS;
        var worker;
        try { worker = this.createWorker(); }
        catch (error) { throw this.transportError("worker-error", "worker", String(error)); }
        // The worker's OS deadline includes opening, writing and reading. The UI
        // watchdog also bounds worker startup/failure, allowing native cleanup first.
        return new Promise((resolve, reject) => {
            var timer;
            var done = false;
            var finish = (response, error) => {
                if (done) return;
                done = true;
                timer?.cancel();
                worker.terminate();
                this.debug(JSON.stringify({ pipe: path, command: name, client: clientID,
                    elapsedMS: Date.now() - started, state: error?.code || (typeof response === "string" && response.startsWith("ERROR:") ? "lyx-error" : "complete"), stage: error?.stage || "response",
                    error: error?.message || null }));
                if (error) reject(error); else resolve(response);
            };
            try {
                timer = this.startTimer(() => finish(null, this.transportError("timeout", "worker")), timeout + 100);
                worker.onerror = event => { event.preventDefault?.(); finish(null, this.transportError("worker-error", "worker", event.message)); };
                worker.onmessage = event => {
                    var result = event.data;
                    finish(result.response, result.error && this.transportError(result.error.code, result.error.stage, result.error.detail));
                };
                worker.postMessage({ path, os: lyz.os, clientID, command: name,
                    bytes: new TextEncoder().encode("LYXCMD:" + clientID + ":" + command + "\n"),
                    requireResponse: !!options.requireResponse || this.expectsResponse(command), deadline: started + timeout });
            } catch (error) { finish(null, error); }
        });
    },

    writeAndRead(lyz, command, options = {}) {
        var operation = (this.commandQueue || Promise.resolve()).then(() => this.request(lyz, command, options));
        this.commandQueue = operation.catch(() => {});
        return operation;
    },

    async askServer(lyz, command, options = {}) {
        try { return await this.writeAndRead(lyz, command, options); }
        catch (error) {
            this.report(options, LyZLocale.getString("lyz-server-error-general", { error: String(error) }));
            return false;
        }
    },

    askServerWithOpenStream(lyz, command, options = {}) {
        return this.askServer(lyz, command, options);
    }
};
