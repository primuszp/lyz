// Keep LyX/database paths intact; convert separators only at native filesystem boundaries.
var LyZFiles = {
    nativePath(path) {
        return Zotero.isWin && typeof path === "string" ? path.replace(/\//g, "\\") : path;
    },
    read(path, options) { return IOUtils.read(this.nativePath(path), options); },
    stat(path) { return IOUtils.stat(this.nativePath(path)); },
    remove(path, options) { return IOUtils.remove(this.nativePath(path), options); },
    copy(source, target, options) { return IOUtils.copy(this.nativePath(source), this.nativePath(target), options); },
    write(path, bytes, options) {
        if (options?.tmpPath) options = { ...options, tmpPath: this.nativePath(options.tmpPath) };
        return IOUtils.write(this.nativePath(path), bytes, options);
    },
    normalize(path) { return PathUtils.normalize(this.nativePath(path)); },
    isAbsolute(path) { return PathUtils.isAbsolute(this.nativePath(path)); },
    parent(path) { return PathUtils.parent(this.nativePath(path)); },
    filename(path) { return PathUtils.filename(this.nativePath(path)); }
};
