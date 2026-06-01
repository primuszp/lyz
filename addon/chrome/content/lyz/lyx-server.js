var LyZServer = {
    requestID: 0,

    getWindow(lyz) {
        return lyz.wm ? lyz.wm.getMostRecentWindow("navigator:browser") : null;
    },

    getPipePath(lyz) {
        if (typeof LyZSettings !== "undefined") {
            return LyZSettings.getCharPref("lyxserver", LyZSettings.getDefaultLyXServerPath());
        }
        return lyz.prefs.getCharPref("lyxserver");
    },

    alert(message, title = LyZLocale.getString("lyz-server-title")) {
        Services.prompt.alert(null, title, message);
    },

    createClientID() {
        return "lyz";
    },

    expectsResponse(command) {
        return command == "server-get-filename" || command == "server-get-xy";
    },

    getDocument(lyz) {
        var res, fname;
        var win = this.getWindow(lyz);
        if (lyz.os == "Win") {
            res = this.askServer(lyz, "server-get-filename");
        } else {
            res = this.askServerWithOpenStream(lyz, "server-get-filename");
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

    parseResponse(command, response) {
        if (!response) {
            return null;
        }
        return this.parseResponseForClient(null, command, response);
    },

    parseResponseForClient(clientID, command, response) {
        if (!response) {
            return null;
        }
        var escapedClient = clientID ? clientID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "[^:]+";
        var escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        var re = new RegExp("INFO:" + escapedClient + ":" + escapedCommand + ":(.*)", "g");
        var match;
        var value = null;
        while ((match = re.exec(response)) !== null) {
            value = match[1].trim();
        }
        return value;
    },

    extractClientResponse(clientID, command, response) {
        var parsed = this.parseResponseForClient(clientID, command, response);
        if (parsed === null) {
            return null;
        }
        return "INFO:" + clientID + ":" + command + ":" + parsed;
    },

    busyWait(milliseconds) {
        var end = Date.now() + milliseconds;
        while (Date.now() < end) {
            Services.tm.currentThread.processNextEvent(false);
        }
    },

    readPipeOutput(lyz) {
        var cstream = null;
        try {
            var pipeout = Components.classes["@mozilla.org/file/local;1"]
                    .createInstance(Components.interfaces.nsIFile);
            pipeout.initWithPath(this.getPipePath(lyz) + ".out");
            if (!pipeout.exists()) {
                return null;
            }

            var pipeout_stream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                    .createInstance(Components.interfaces.nsIFileInputStream);
            cstream = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
                    .createInstance(Components.interfaces.nsIConverterInputStream);
            var str = {};
            pipeout_stream.init(pipeout, -1, 0, 0);
            cstream.init(pipeout_stream, "UTF-8", 0, 0);
            cstream.readString(-1, str);
            cstream.close();
            return str.value;
        } catch (e) {
            if (cstream) {
                try {
                    cstream.close();
                } catch (closeError) {
                    // Ignore cleanup failures while polling the named pipe.
                }
            }
            return null;
        }
    },

    waitForClientResponse(lyz, clientID, command, initialData) {
        var data = initialData;
        var response = this.extractClientResponse(clientID, command, data);
        if (response) {
            return response;
        }

        for (var i = 0; i < 20; i++) {
            this.busyWait(50);
            data = this.readPipeOutput(lyz);
            response = this.extractClientResponse(clientID, command, data);
            if (response) {
                return response;
            }
        }
        return null;
    },

    getPosition(lyz) {
        var res;
        if (lyz.os == "Win") {
            res = this.askServer(lyz, "server-get-xy");
        } else {
            res = this.askServerWithOpenStream(lyz, "server-get-xy");
        }
        return this.parseResponse("server-get-xy", res);
    },

    pipeInit(lyz) {
        var pipeout;
        var path;
        var pipeout_stream;
        var cstream;
        var win = this.getWindow(lyz);

        pipeout = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);
        path = this.getPipePath(lyz);
        pipeout.initWithPath(path + ".out");
        if (!pipeout.exists()) {
            this.alert(LyZLocale.getString("lyz-server-pipe-not-exist"));
            return null;
        }
        pipeout_stream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                .createInstance(Components.interfaces.nsIFileInputStream);
        cstream = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
                .createInstance(Components.interfaces.nsIConverterInputStream);
        pipeout_stream.init(pipeout, -1, 0, 0);
        cstream.init(pipeout_stream, "UTF-8", 0, 0);
        return cstream;
    },

    writeAndRead(lyz, command) {
        var pipein, pipein_stream, msg, str, data;
        var win = this.getWindow(lyz);
        var clientID = this.createClientID();

        try {
            pipein = Components.classes["@mozilla.org/file/local;1"]
                    .createInstance(Components.interfaces.nsIFile);
            pipein.initWithPath(this.getPipePath(lyz) + ".in");
        } catch (e) {
            this.alert(LyZLocale.getString("lyz-server-wrong-path", { path: this.getPipePath(lyz), error: String(e) }));
            return false;
        }

        if (!pipein.exists()) {
            this.alert(LyZLocale.getString("lyz-server-wrong-path-hint"));
            return false;
        }

        try {
            pipein_stream = Components.classes["@mozilla.org/network/file-output-stream;1"]
                    .createInstance(Components.interfaces.nsIFileOutputStream);
            pipein_stream.init(pipein, 0x02 | 0x10, 0666, 0);
        } catch (e) {
            this.alert(LyZLocale.getString("lyz-server-command-failed", { command }));
            return false;
        }

        msg = "LYXCMD:" + clientID + ":" + command + "\n";
        pipein_stream.write(msg, msg.length);
        pipein_stream.close();

        if (!this.expectsResponse(command)) {
            return true;
        }

        data = "";
        str = {};

        var pipeout = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);
        pipeout.initWithPath(this.getPipePath(lyz) + ".out");
        if (!pipeout.exists()) {
            this.alert(LyZLocale.getString("lyz-server-pipe-not-exist"));
            return null;
        }
        var pipeout_stream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                .createInstance(Components.interfaces.nsIFileInputStream);
        var cstream = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
                .createInstance(Components.interfaces.nsIConverterInputStream);
        pipeout_stream.init(pipeout, -1, 0, 0);
        cstream.init(pipeout_stream, "UTF-8", 0, 0);

        cstream.readString(-1, str);
        data = str.value;
        cstream.close();
        return this.waitForClientResponse(lyz, clientID, command, data);
    },

    askServer(lyz, command) {
        var win = this.getWindow(lyz);

        try {
            return this.writeAndRead(lyz, command);
        } catch (x) {
            this.alert(LyZLocale.getString("lyz-server-error-general", { error: String(x) }));
            return false;
        }
    },

    writeAndReadWithOpenStream(lyz, command, cstream) {
        var pipein, pipein_stream, msg, str, data;
        var win = this.getWindow(lyz);
        var clientID = this.createClientID();

        try {
            pipein = Components.classes["@mozilla.org/file/local;1"]
            .createInstance(Components.interfaces.nsIFile);
            pipein.initWithPath(this.getPipePath(lyz) + ".in");
        } catch (e) {
            this.alert(LyZLocale.getString("lyz-server-wrong-path", { path: this.getPipePath(lyz), error: String(e) }));
            return false;
        }

        if (!pipein.exists()) {
            this.alert(LyZLocale.getString("lyz-server-wrong-path-hint"));
            return false;
        }

        try {
            pipein_stream = Components.classes["@mozilla.org/network/file-output-stream;1"]
            .createInstance(Components.interfaces.nsIFileOutputStream);
            pipein_stream.init(pipein, 0x02 | 0x10, 0666, 0);
        } catch (e) {
            this.alert(LyZLocale.getString("lyz-server-command-failed", { command }));
            return false;
        }

        msg = "LYXCMD:" + clientID + ":" + command + "\n";
        pipein_stream.write(msg, msg.length);
        pipein_stream.close();

        if (!this.expectsResponse(command)) {
            try {
                cstream.close();
            } catch (e) {
                // Ignore close errors after fire-and-forget LyX commands.
            }
            return true;
        }

        data = "";
        str = {};
        cstream.readString(-1, str);
        data = str.value;
        cstream.close();
        return this.waitForClientResponse(lyz, clientID, command, data);
    },

    askServerWithOpenStream(lyz, command) {
        var win = this.getWindow(lyz);
        var cstream;
        try {
            cstream = this.pipeInit(lyz);
        } catch (x) {
            this.alert(LyZLocale.getString("lyz-server-error-general", { error: String(x) }));
            return null;
        }
        try {
            return this.writeAndReadWithOpenStream(lyz, command, cstream);
        } catch (x) {
            this.alert(LyZLocale.getString("lyz-server-error-general", { error: String(x) }));
            return null;
        }
    }
};
