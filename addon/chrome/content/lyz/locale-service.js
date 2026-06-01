/**
 * LyZLocale — synchronous Fluent localization service for LyZ.
 *
 * Usage:
 *   const msg = LyZLocale.getString("lyz-msg-select-citation");
 *   const msg = LyZLocale.getString("lyz-msg-updating-doc", { doc: "thesis.lyx" });
 */
var LyZLocale = {
    _l10n: null,

    get l10n() {
        if (!this._l10n) {
            this._l10n = new Localization(["chrome://lyz/locale/lyz.ftl"], true);
        }
        return this._l10n;
    },

    /**
     * Returns a localized string synchronously.
     * @param {string} id   - Fluent message ID
     * @param {object} args - Optional named arguments ({ varName: value })
     * @returns {string}
     */
    getString(id, args) {
        try {
            const val = this.l10n.formatValueSync(id, args || null);
            if (val !== null && val !== undefined) {
                return val;
            }
        } catch (e) {
            Services.console.logStringMessage("LyZLocale: formatValueSync failed for '" + id + "': " + e);
        }
        return id;
    },

    /**
     * Returns a localized attribute value synchronously.
     * @param {string} id        - Fluent message ID
     * @param {string} attribute - Attribute name (e.g. "label", "tooltiptext")
     * @param {object} args      - Optional named arguments
     * @returns {string}
     */
    getAttribute(id, attribute, args) {
        try {
            const messages = this.l10n.formatMessagesSync([{ id, args: args || null }]);
            if (messages && messages[0] && messages[0].attributes) {
                const attr = messages[0].attributes.find(a => a.name === attribute);
                if (attr) return attr.value;
            }
        } catch (e) {
            Services.console.logStringMessage("LyZLocale: getAttribute failed for '" + id + "." + attribute + "': " + e);
        }
        return id;
    },

    reset() {
        this._l10n = null;
    }
};
