function onLoad() {
	var settings = LyZSettings.getValues();
	document.getElementById("lyxserver").value = settings.lyxserver;
	document.getElementById("citekey").value = settings.citekey;
	if (settings.createCiteKey){
		document.getElementById("createcitekey").checked = true;
		document.getElementById("citekey").disabled = false;
	} else {
		document.getElementById("createcitekey").checked = false;
		document.getElementById("citekey").disabled = true;
	}
	var translators = window.arguments[0].inn.translators;
	
	document.getElementById("journalabbrev").checked = settings.useJournalAbbreviation;

	var formatMenu = document.getElementById("format-menu");
	var formatPopup = document.getElementById("format-popup");
	var defaultIndex = 0;

	// add styles to format popup
	for ( var i in translators) {
		var itemNode = document.createElement("menuitem");
		itemNode.setAttribute("label", translators[i].label);
		formatPopup.appendChild(itemNode);

		// select last selected translator
		if (translators[i].translatorID == settings.selectedTranslator) {
			formatMenu.selectedIndex = i;
		}
		if (translators[i].translatorID == '9cb70025-a888-4a29-a210-93ec52da40d4') {
			defaultIndex = i; // plain BibTeX
		}
		if (translators[i].target != "bib") {
			itemNode.setAttribute("hidden", true);
		}
	}
	// select plain BibTeX as default:
	if (formatMenu.selectedIndex == -1) {
		formatMenu.selectedIndex = defaultIndex;
	}
}

function onOK() {
	var index = document.getElementById("format-menu").selectedIndex;
	var values = {
		lyxserver : document.getElementById("lyxserver").value,
		citekey : document.getElementById("citekey").value,
		createcitekey: document.getElementById("createcitekey").checked,
		selectedTranslator : window.arguments[0].inn.translators[index].translatorID,
		useJournalAbbreviation : document.getElementById("journalabbrev").checked
	};
	LyZSettings.saveValues({
		lyxserver: values.lyxserver,
		citekey: values.citekey,
		createCiteKey: values.createcitekey,
		selectedTranslator: values.selectedTranslator,
		useJournalAbbreviation: values.useJournalAbbreviation
	});
	window.arguments[0].out = values;
	return true;
}

function enableCiteKey(){
	if (document.getElementById("citekey").disabled){
		document.getElementById("citekey").disabled = false;
	} else {
		document.getElementById("citekey").disabled = true;
	}
}

