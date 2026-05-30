var LyZServer = {
    getWindow(lyz) {
        return lyz.wm ? lyz.wm.getMostRecentWindow("navigator:browser") : null;
    },

    getPipePath(lyz) {
        if (typeof LyZSettings !== "undefined") {
            return LyZSettings.getCharPref("lyxserver", LyZSettings.getDefaultLyXServerPath());
        }
        return lyz.prefs.getCharPref("lyxserver");
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
            if (win) {
                win.alert("Could not contact server at: " + this.getPipePath(lyz));
            }
            return null;
        }

        fname = this.parseResponse("server-get-filename", res);
        if (fname === null) {
            if (win) {
                win.alert("ERROR: lyxGetDoc: \n\n" + res);
            }
            return null;
        }
        if (!fname) {
            if (win) {
                win.alert("LyX responded, but did not return an active filename.\n\n"
                    + "Make sure the LyX document is saved and the document window is active.");
            }
            return null;
        }
        return fname;
    },

    parseResponse(command, response) {
        if (!response) {
            return null;
        }
        var escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        var re = new RegExp("INFO:lyz:" + escapedCommand + ":(.*)", "g");
        var match;
        var value = null;
        while ((match = re.exec(response)) !== null) {
            value = match[1].trim();
        }
        return value;
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
            if (win) {
                win.alert("The specified LyXServer pipe does not exist.");
            }
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

        try {
            pipein = Components.classes["@mozilla.org/file/local;1"]
                    .createInstance(Components.interfaces.nsIFile);
            pipein.initWithPath(this.getPipePath(lyz) + ".in");
        } catch (e) {
            if (win) {
                win.alert("Wrong path to Lyx server:\n" + this.getPipePath(lyz) + "\n" + e);
            }
            return false;
        }

        if (!pipein.exists()) {
            if (win) {
                win.alert("Wrong path to Lyx server.\nSet the path specified in Lyx preferences.");
            }
            return false;
        }

        try {
            pipein_stream = Components.classes["@mozilla.org/network/file-output-stream;1"]
                    .createInstance(Components.interfaces.nsIFileOutputStream);
            pipein_stream.init(pipein, 0x02 | 0x10, 0666, 0);
        } catch (e) {
            if (win) {
                win.alert("Failed to:\n" + command);
            }
            return false;
        }

        msg = "LYXCMD:lyz:" + command + "\n";
        pipein_stream.write(msg, msg.length);
        pipein_stream.close();

        data = "";
        str = {};

        var pipeout = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);
        pipeout.initWithPath(this.getPipePath(lyz) + ".out");
        if (!pipeout.exists()) {
            if (win) {
                win.alert("The specified LyXServer pipe does not exist.");
            }
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
        return data;
    },

    askServer(lyz, command) {
        var win = this.getWindow(lyz);

        try {
            return this.writeAndRead(lyz, command);
        } catch (x) {
            if (win) {
                win.alert("SERVER ERROR:\n" + x);
            }
            return false;
        }
    },

    writeAndReadWithOpenStream(lyz, command, cstream) {
        var pipein, pipein_stream, msg, str, data;
        var win = this.getWindow(lyz);

        try {
            pipein = Components.classes["@mozilla.org/file/local;1"]
            .createInstance(Components.interfaces.nsIFile);
            pipein.initWithPath(this.getPipePath(lyz) + ".in");
        } catch (e) {
            if (win) {
                win.alert("Wrong path to Lyx server:\n" + this.getPipePath(lyz) + "\n" + e);
            }
            return false;
        }

        if (!pipein.exists()) {
            if (win) {
                win.alert("Wrong path to Lyx server.\nSet the path specified in Lyx preferences.");
            }
            return false;
        }

        try {
            pipein_stream = Components.classes["@mozilla.org/network/file-output-stream;1"]
            .createInstance(Components.interfaces.nsIFileOutputStream);
            pipein_stream.init(pipein, 0x02 | 0x10, 0666, 0);
        } catch (e) {
            if (win) {
                win.alert("Failed to:\n" + command);
            }
            return false;
        }

        msg = "LYXCMD:lyz:" + command + "\n";
        pipein_stream.write(msg, msg.length);
        pipein_stream.close();

        data = "";
        str = {};
        cstream.readString(-1, str);
        data = str.value;
        cstream.close();
        return data;
    },

    askServerWithOpenStream(lyz, command) {
        var win = this.getWindow(lyz);
        var cstream;
        try {
            cstream = this.pipeInit(lyz);
        } catch (x) {
            if (win) {
                win.alert("SERVER ERROR:\n" + x);
            }
            return null;
        }
        try {
            return this.writeAndReadWithOpenStream(lyz, command, cstream);
        } catch (x) {
            if (win) {
                win.alert("SERVER ERROR:\n" + x);
            }
            return null;
        }
    }
};
