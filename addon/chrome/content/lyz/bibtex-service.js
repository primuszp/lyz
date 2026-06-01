var LyZBibTeX = {
    async exportItems(lyz, items, bib, zids) {
        var text;

        var callback = function(obj, worked) {
            text = obj.string;
        };

        var translation = new Zotero.Translate.Export;
        var translatorID = lyz.prefs.getCharPref("selectedTranslator");
        translation.setTranslator(translatorID);
        translation.setHandler("done", callback);

        var useUTF8 = lyz.prefs.getBoolPref("use_utf8");
        var displayOptions = {};
        if (useUTF8) {
            displayOptions.exportCharset = "UTF-8";
        } else {
            displayOptions.exportCharset = "escape";
        }
        if (lyz.prefs.getBoolPref("useJournalAbbreviation")) {
            displayOptions.useJournalAbbreviation = "True";
        }
        translation.setDisplayOptions(displayOptions);

        var exportedItems = [];
        var newCitekeys = [];
        for (var i = 0; i < items.length; i++) {
            var id = Zotero.Items.getLibraryKeyHash(items[i]);
            translation.setItems([items[i]]);
            await translation.translate();
            text = this.escapeUnicodeForBibTeX(text);
            var citeTuple;
            if (lyz.prefs.getBoolPref("createCiteKey") === true) {
                citeTuple = await this.createCiteKey(lyz, id, text, bib, items[i].key, newCitekeys);
                newCitekeys.push(citeTuple[0]);
            } else {
                var key = this.extractBibTeXKey(text) || this.fallbackCiteKey(id, items[i].key);
                citeTuple = [key, text];
            }
            exportedItems[id] = [citeTuple[0], citeTuple[1]];
        }

        return exportedItems;
    },

    escapeUnicodeForBibTeX(text) {
        const replacements = {
            "á": "{\\'a}", "Á": "{\\'A}",
            "é": "{\\'e}", "É": "{\\'E}",
            "í": "{\\'i}", "Í": "{\\'I}",
            "ó": "{\\'o}", "Ó": "{\\'O}",
            "ú": "{\\'u}", "Ú": "{\\'U}",
            "ö": "{\\\"o}", "Ö": "{\\\"O}",
            "ü": "{\\\"u}", "Ü": "{\\\"U}",
            "ő": "{\\H{o}}", "Ő": "{\\H{O}}",
            "ű": "{\\H{u}}", "Ű": "{\\H{U}}",
            "à": "{\\`a}", "À": "{\\`A}",
            "è": "{\\`e}", "È": "{\\`E}",
            "ì": "{\\`i}", "Ì": "{\\`I}",
            "ò": "{\\`o}", "Ò": "{\\`O}",
            "ù": "{\\`u}", "Ù": "{\\`U}",
            "â": "{\\^a}", "Â": "{\\^A}",
            "ê": "{\\^e}", "Ê": "{\\^E}",
            "î": "{\\^i}", "Î": "{\\^I}",
            "ô": "{\\^o}", "Ô": "{\\^O}",
            "û": "{\\^u}", "Û": "{\\^U}",
            "ä": "{\\\"a}", "Ä": "{\\\"A}",
            "ë": "{\\\"e}", "Ë": "{\\\"E}",
            "ï": "{\\\"i}", "Ï": "{\\\"I}",
            "ÿ": "{\\\"y}", "Ÿ": "{\\\"Y}",
            "ñ": "{\\~n}", "Ñ": "{\\~N}",
            "ç": "{\\c{c}}", "Ç": "{\\c{C}}",
            "š": "{\\v{s}}", "Š": "{\\v{S}}",
            "ž": "{\\v{z}}", "Ž": "{\\v{Z}}",
            "č": "{\\v{c}}", "Č": "{\\v{C}}",
            "ř": "{\\v{r}}", "Ř": "{\\v{R}}",
            "ď": "{\\v{d}}", "Ď": "{\\v{D}}",
            "ť": "{\\v{t}}", "Ť": "{\\v{T}}",
            "ľ": "{\\v{l}}", "Ľ": "{\\v{L}}",
            "ł": "{\\l}", "Ł": "{\\L}",
            "ø": "{\\o}", "Ø": "{\\O}",
            "å": "{\\aa}", "Å": "{\\AA}",
            "æ": "{\\ae}", "Æ": "{\\AE}",
            "œ": "{\\oe}", "Œ": "{\\OE}",
            "ß": "{\\ss}"
        };
        return text.replace(/[^\x00-\x7F]/g, char => replacements[char] || char);
    },

    extractBibTeXKey(text) {
        var match = /@[a-zA-Z]+\s*\{\s*([^,\s]+)\s*,/.exec(text);
        return match ? match[1] : null;
    },

    extractBibTeXField(text, fieldName) {
        var escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        var match = new RegExp("[\\s,]" + escapedField + "\\s*=\\s*\\{([^\\n]*)\\}\\s*,?", "i").exec(text);
        return match ? match[1] : null;
    },

    fallbackCiteKey(id, objKey) {
        return this.cleanCiteKey(id || objKey || "lyz");
    },

    cleanCiteKey(citekey) {
        citekey = String(citekey || "");
        citekey = citekey.replace(/\\.\{/g, "");
        citekey = citekey.replace(/[^a-zA-Z0-9\!\$\&\*\+\-\.\/\:\;\<\>\?\[\]\^\_\`\|]+/g, "");
        return citekey || "lyz";
    },

    replaceBibTeXKey(text, oldkey, citekey) {
        if (oldkey) {
            return text.replace(oldkey, citekey);
        }
        return text.replace(/(@[a-zA-Z]+\s*\{\s*)/, "$1" + citekey + ",");
    },

    async createCiteKey(lyz, id, text, bib, objKey, keyBlacklist) {
        var oldkey = this.extractBibTeXKey(text);
        var dic = [];
        dic.zotero = id;
        var citekey;
        if (lyz.prefs.getCharPref("citekey") == "zotero") {
            citekey = this.cleanCiteKey(id);
            text = this.replaceBibTeXKey(text, oldkey, citekey);
            return [citekey, text];
        } else if (lyz.prefs.getCharPref("citekey") == "zoteroShort") {
            citekey = this.fallbackCiteKey(null, objKey);
            text = this.replaceBibTeXKey(text, oldkey, citekey);
            return [citekey, text];
        }

        var authors;
        var author;
        var title;
        var year;
        var p;
        citekey = "";

        authors = this.extractBibTeXField(text, "author") || this.extractBibTeXField(text, "editor");

        var nonLatin;
        if (authors) {
            if (authors.split(" and ").length > 1) {
                author = authors.split(" and ")[0].split(",");
                author = author[0].toLowerCase();
            } else {
                author = authors.split(",");
                author = author[0].toLowerCase();
            }
            if (author[0].charCodeAt() > 7929) {
                nonLatin = true;
                author = author.codePointAt(0).toString(16);
            }

            var tmp = "";
            for (var i in author) {
                if (author[i] in lyz_charmap) {
                    tmp += lyz_charmap[author[i]];
                } else {
                    tmp += author[i];
                }
            }
            author = tmp;
        } else {
            author = "";
        }

        dic.author = author;

        if (nonLatin) {
            title = "";
        } else {
            var titleField = this.extractBibTeXField(text, "title");
            if (titleField) {
                var t = titleField.toLowerCase();
                t = t.replace(/[^a-z0-9\s]/g, "");
                t = t.split(/\s+/).filter(Boolean);
                t.reverse();
                title = t.pop() || "";
                if (title.length < 6 && t.length > 0) {
                    title += t.pop();
                }
                if (title.length < 7 && t.length > 0) {
                    title += t.pop();
                }
            } else {
                title = "";
            }
        }
        dic.title = title;

        var yearField = this.extractBibTeXField(text, "year") || this.extractBibTeXField(text, "date");
        var yearMatch = yearField ? /\D*(\d+)/.exec(yearField) : null;
        year = yearMatch ? yearMatch[1].replace(" ", "") : "";
        dic.year = year;

        p = lyz.prefs.getCharPref("citekey").split(" ");
        for (var j = 0; j < p.length; j++) {
            if (p[j] in dic) {
                citekey += dic[p[j]];
            } else {
                citekey += p[j];
            }
        }

        citekey = this.cleanCiteKey(citekey);
        if (citekey == "lyz") {
            citekey = this.fallbackCiteKey(id, objKey);
        }

        var testKey = citekey;
        var count = 1;
        while (true) {
            count = count + 1;
            if (keyBlacklist.indexOf(testKey) != -1) {
                testKey = citekey + count;
                continue;
            }
            var res = await LyZDatabase.findConflictingKey(lyz, bib, testKey, id);
            if (res.length > 0) {
                testKey = citekey + count;
                continue;
            }
            citekey = testKey;
            break;
        }
        text = this.replaceBibTeXKey(text, oldkey, citekey);
        return [citekey, text];
    }
};
