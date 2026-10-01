// ChromeWorker: all native calls stay off Zotero's UI thread.
var LyZPipeWorker = {
    error(code, stage, detail) {
        var error = new Error(detail || code);
        error.code = code; error.stage = stage;
        return error;
    },
    pause(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },
    async run(request, io) {
        var input, output;
        var stage = "open";
        var check = () => {
            if (Date.now() >= request.deadline) throw this.error("timeout", stage);
        };
        try {
            check();
            output = await io.open(request.path + ".out", false);
            input = await io.open(request.path + ".in", true);
            stage = "write"; check();
            if (await io.write(input, request.bytes) !== request.bytes.length) {
                throw this.error("short-write", stage);
            }
            io.close(input); input = undefined;
            if (!request.requireResponse) return true;
            stage = "read";
            var decoder = new TextDecoder("utf-8", { fatal: true });
            var pending = "";
            var received = 0;
            while (true) {
                check();
                var bytes;
                try { bytes = await io.read(output); }
                catch (error) {
                    if (error.code !== "pipe-disconnected" || pending) throw error;
                    // LyX rotates output pipe instances after a reply. Reconnect
                    // the reader, never resend a command that may have executed.
                    io.close(output); output = undefined;
                    check();
                    await this.pause(20);
                    output = await io.open(request.path + ".out", false);
                    continue;
                }
                if (bytes?.length) {
                    received += bytes.length;
                    if (received > 1024 * 1024) throw this.error("response-limit", stage);
                    pending += decoder.decode(bytes, { stream: true });
                    var lines = pending.split("\n");
                    pending = lines.pop();
                    var response = null;
                    for (var line of lines) {
                        line = line.replace(/\r$/, "");
                        if (line.startsWith("INFO:" + request.clientID + ":" + request.command + ":")
                                || line.startsWith("ERROR:" + request.clientID + ":" + request.command + ":")) {
                            response = line;
                        }
                    }
                    if (response !== null) return response;
                } else await this.pause(Math.min(20, Math.max(1, request.deadline - Date.now())));
            }
        } catch (error) {
            if (!error.code) { error.code = "native-error"; error.stage = stage; }
            throw error;
        } finally {
            if (input !== undefined) io.close(input);
            if (output !== undefined) io.close(output);
            io.dispose();
        }
    },

    windows(request) {
        var lib = ctypes.open("kernel32.dll");
        var abi = ctypes.winapi_abi;
        var handle = ctypes.voidptr_t, dword = ctypes.uint32_t, bool = ctypes.int;
        var overlap = ctypes.StructType("LYZ_OVERLAPPED", [
            { Internal: ctypes.uintptr_t }, { InternalHigh: ctypes.uintptr_t },
            { Offset: dword }, { OffsetHigh: dword }, { hEvent: handle }
        ]);
        var declare = (name, result, ...args) => lib.declare(name, abi, result, ...args);
        var create = declare("CreateFileW", handle, ctypes.char16_t.ptr, dword, dword, handle, dword, dword, handle);
        var close = declare("CloseHandle", bool, handle);
        var event = declare("CreateEventW", handle, handle, bool, bool, ctypes.char16_t.ptr);
        var read = declare("ReadFile", bool, handle, ctypes.voidptr_t, dword, dword.ptr, overlap.ptr);
        var write = declare("WriteFile", bool, handle, ctypes.voidptr_t, dword, dword.ptr, overlap.ptr);
        var result = declare("GetOverlappedResultEx", bool, handle, overlap.ptr, dword.ptr, dword, bool);
        var drain = declare("GetOverlappedResult", bool, handle, overlap.ptr, dword.ptr, bool);
        var cancel = declare("CancelIoEx", bool, handle, overlap.ptr);
        // js-ctypes captures last-error immediately after the foreign call.
        // Calling GetLastError through libffi can itself overwrite that value.
        var error = () => ctypes.winLastError;
        var fail = (stage, value) => {
            throw this.error(value === 2 || value === 3 ? "missing-pipe"
                : value === 109 || value === 232 || value === 233 ? "pipe-disconnected" : "native-error", stage, "Windows error " + value);
        };
        var transfer = (fd, buffer, count, writing) => {
            var operation = overlap();
            operation.hEvent = event(null, 1, 0, null);
            if (operation.hEvent.isNull()) fail(writing ? "write" : "read", error());
            var transferred = dword();
            try {
                var success = (writing ? write : read)(fd, buffer, count, transferred.address(), operation.address());
                if (!success) {
                    var nativeError = error();
                    if (nativeError !== 997) fail(writing ? "write" : "read", nativeError);
                    var remaining = Math.max(0, request.deadline - Date.now());
                    if (!result(fd, operation.address(), transferred.address(), remaining, 0)) {
                        nativeError = error();
                        // Complete cancellation before releasing OVERLAPPED/buffer memory.
                        cancel(fd, operation.address());
                        drain(fd, operation.address(), transferred.address(), 1);
                        if (nativeError === 258 || nativeError === 996) throw this.error("timeout", writing ? "write" : "read");
                        fail(writing ? "write" : "read", nativeError);
                    }
                }
                return transferred.value;
            } finally { close(operation.hEvent); }
        };
        return {
            open: async (path, writing) => {
                // Local named-pipe opens return immediately; retry busy instances without WaitNamedPipe.
                if (!/^\\\\\.\\pipe\\/i.test(path)) throw this.error("invalid-path", "open", "A local Windows named pipe is required");
                while (Date.now() < request.deadline) {
                    var fd = create(path, writing ? 0x40000000 : 0x80000000, 0, null, 3, 0x40000000, null);
                    if (ctypes.cast(fd, ctypes.intptr_t).value.toString() !== "-1") return fd;
                    var nativeError = error();
                    if (nativeError !== 231) fail("open", nativeError);
                    await this.pause(20);
                }
                throw this.error("timeout", "open");
            },
            write: (fd, bytes) => transfer(fd, ctypes.uint8_t.array(bytes.length)(Array.from(bytes)), bytes.length, true),
            read: fd => {
                var buffer = ctypes.uint8_t.array(4096)();
                var count = transfer(fd, buffer, 4096, false);
                return Uint8Array.from({ length: count }, (_, i) => buffer[i]);
            },
            close: fd => close(fd), dispose: () => lib.close()
        };
    },

    unix(request) {
        var mac = request.os === "Mac";
        var lib = ctypes.open(mac ? "/usr/lib/libSystem.B.dylib" : "libc.so.6");
        var declare = (name, result, ...args) => lib.declare(name, ctypes.default_abi, result, ...args);
        var open = declare("open", ctypes.int, ctypes.char.ptr, ctypes.int);
        var close = declare("close", ctypes.int, ctypes.int);
        var read = declare("read", ctypes.ssize_t, ctypes.int, ctypes.voidptr_t, ctypes.size_t);
        var write = declare("write", ctypes.ssize_t, ctypes.int, ctypes.voidptr_t, ctypes.size_t);
        var seek = declare("lseek", ctypes.int64_t, ctypes.int, ctypes.int64_t, ctypes.int);
        var errno = () => ctypes.errno;
        // Block SIGPIPE only on this disposable worker thread, never process-wide.
        var mask = ctypes.unsigned_long.array(16)();
        var originalMask = ctypes.unsigned_long.array(16)();
        var empty = declare("sigemptyset", ctypes.int, ctypes.voidptr_t);
        var add = declare("sigaddset", ctypes.int, ctypes.voidptr_t, ctypes.int);
        var block = declare("pthread_sigmask", ctypes.int, ctypes.int, ctypes.voidptr_t, ctypes.voidptr_t);
        var pending = declare("sigpending", ctypes.int, ctypes.voidptr_t);
        var member = declare("sigismember", ctypes.int, ctypes.voidptr_t, ctypes.int);
        var wait = declare("sigwait", ctypes.int, ctypes.voidptr_t, ctypes.int.ptr);
        if (empty(mask) || add(mask, 13) || block(mac ? 1 : 0, mask, originalMask)) {
            lib.close(); throw this.error("native-error", "open", "Cannot block worker SIGPIPE");
        }
        var retry = value => value === 4 || value === (mac ? 35 : 11);
        var fail = (stage, value) => { throw this.error(value === 2 ? "missing-pipe" : "native-error", stage, "Unix error " + value); };
        return {
            open: async (path, writing) => {
                if (!path.startsWith("/")) throw this.error("invalid-path", "open", "An absolute pipe path is required");
                while (Date.now() < request.deadline) {
                    var fd = open(path, (writing ? 1 : 0) | (mac ? 4 : 2048));
                    if (fd >= 0) {
                        // Reject regular files before a configured .in path can
                        // receive command bytes. Pipes cannot be repositioned.
                        var offset = seek(fd, 0, 0);
                        if (offset.toString() !== "-1" || errno() !== 29) {
                            close(fd); throw this.error("invalid-path", "open", "A pipe endpoint is required");
                        }
                        return fd;
                    }
                    var nativeError = errno();
                    if (nativeError !== 6 && !retry(nativeError)) fail("open", nativeError);
                    await this.pause(20);
                }
                throw this.error("timeout", "open");
            },
            write: (fd, bytes) => {
                var buffer = ctypes.uint8_t.array(bytes.length)(Array.from(bytes));
                var count = Number(write(fd, buffer, bytes.length).toString());
                if (count < 0) fail("write", errno());
                return count;
            },
            read: fd => {
                var buffer = ctypes.uint8_t.array(4096)();
                var count = Number(read(fd, buffer, 4096).toString());
                if (count < 0) {
                    var nativeError = errno();
                    if (retry(nativeError)) return null;
                    fail("read", nativeError);
                }
                return Uint8Array.from({ length: count }, (_, i) => buffer[i]);
            },
            close: fd => close(fd), dispose: () => {
                // Worker threads may be pooled. Consume our blocked SIGPIPE and
                // restore the previous thread mask before returning the thread.
                var signals = ctypes.unsigned_long.array(16)();
                var signal = ctypes.int();
                if (!pending(signals) && member(signals, 13) === 1) wait(mask, signal.address());
                block(mac ? 3 : 2, originalMask, null);
                lib.close();
            }
        };
    }
};

onmessage = async event => {
    var request = event.data;
    try {
        var io = request.os === "Win" ? LyZPipeWorker.windows(request) : LyZPipeWorker.unix(request);
        var response = await LyZPipeWorker.run(request, io);
        postMessage({ response });
    } catch (error) {
        postMessage({ error: { code: error.code || "worker-error", stage: error.stage || "open", detail: String(error.message || error) } });
    }
};
