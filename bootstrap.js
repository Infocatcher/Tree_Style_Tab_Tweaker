const WINDOW_LOADED = -1;
const WINDOW_CLOSED = -2;

Components.utils.import("resource://gre/modules/Services.jsm");

function install(params, reason) {
}
function uninstall(params, reason) {
}
function startup(params, reason) {
	windowsObserver.init(reason);
}
function shutdown(params, reason) {
	windowsObserver.destroy(reason);
}

var windowsObserver = {
	initialized: false,
	init: function(reason) {
		if(this.initialized)
			return;
		this.initialized = true;

		var ws = Services.wm.getEnumerator("navigator:browser");
		while(ws.hasMoreElements())
			this.initWindow(ws.getNext(), reason);
		Services.ww.registerNotification(this);
	},
	destroy: function(reason) {
		if(!this.initialized)
			return;
		this.initialized = false;

		var ws = Services.wm.getEnumerator("navigator:browser");
		while(ws.hasMoreElements())
			this.destroyWindow(ws.getNext(), reason);
		Services.ww.unregisterNotification(this);

		if(reason != APP_SHUTDOWN)
			this.loadStyles(false);
	},

	observe: function(subject, topic, data) {
		if(topic == "domwindowopened")
			subject.addEventListener("load", this, false);
		else if(topic == "domwindowclosed")
			this.destroyWindow(subject, WINDOW_CLOSED);
	},
	handleEvent: function(e) {
		switch(e.type) {
			case "load":     this.loadHandler(e);     break;
			case "TabClose": this.tabCloseHandler(e); break;
			case "click":    this.clickHandler(e);    break;
			case "keypress": this.keypressHandler(e);
		}
	},
	loadHandler: function(e) {
		var window = e.originalTarget.defaultView;
		window.removeEventListener("load", this, false);
		this.initWindow(window, WINDOW_LOADED);
	},

	initWindow: function(window, reason) {
		if(reason == WINDOW_LOADED && !this.isTargetWindow(window))
			return;

		window.addEventListener("TabClose", this, true);

		Array.forEach(
			window.gBrowser.tabs,
			function(tab) {
				if(this.ss.getTabValue(tab, this.tabKeyParentId)) {
					tab.linkedBrowser.addEventListener("click", this, true);
					tab.linkedBrowser.addEventListener("keypress", this, true);
					this.loadStyles(true);
				}
			},
			this
		);
	},
	destroyWindow: function(window, reason) {
		window.removeEventListener("load", this, false); // Window can be closed before "load"
		if(reason == WINDOW_CLOSED && !this.isTargetWindow(window))
			return;

		window.removeEventListener("TabClose", this, true);

		var forceCleanup = reason == ADDON_DISABLE || reason == ADDON_UNINSTALL;
		Array.forEach(
			window.gBrowser.tabs,
			function(tab) {
				if(forceCleanup)
					this.ss.deleteTabValue(tab, this.tabKeyId);
				if(this.ss.getTabValue(tab, this.tabKeyParentId)) {
					tab.linkedBrowser.removeEventListener("click", this, true);
					tab.linkedBrowser.removeEventListener("keypress", this, true);
					if(forceCleanup) {
						this.ss.deleteTabValue(tab, this.tabKeyParentURI);
						this.ss.deleteTabValue(tab, this.tabKeyParentURI);
					}
				}
			},
			this
		);
	},
	isTargetWindow: function(window) {
		return window.document.documentElement.getAttribute("windowtype") == "navigator:browser";
	},

	get sss() {
		delete this.sss;
		return this.sss = Components.classes["@mozilla.org/content/style-sheet-service;1"]
			.getService(Components.interfaces.nsIStyleSheetService);
	},
	_stylesLoaded: false,
	loadStyles: function(load) {
		if(!load ^ this._stylesLoaded)
			return;
		this._stylesLoaded = load;
		var cssURI = Services.io.newURI("chrome://treestyletabtweaker/content/content.css", null, null);
		var sss = this.sss;
		if(!load ^ sss.sheetRegistered(cssURI, sss.USER_SHEET))
			return;
		if(load)
			sss.loadAndRegisterSheet(cssURI, sss.USER_SHEET);
		else
			sss.unregisterSheet(cssURI, sss.USER_SHEET);
	},

	tabKeyId:        "treeStyleTabTweaker-id",
	tabKeyParentId:  "treeStyleTabTweaker-parentId",
	tabKeyParentURI: "treeStyleTabTweaker-parentURI",
	get ss() {
		delete this.ss;
		return this.ss = Components.classes["@mozilla.org/browser/sessionstore;1"]
			.getService(Components.interfaces.nsISessionStore);
	},
	tabCloseHandler: function(aEvent) {
		var tab = aEvent.originalTarget;
		if(this.ss.getTabValue(tab, this.tabKeyParentId)) {
			tab.linkedBrowser.removeEventListener("click", this, true);
			tab.linkedBrowser.removeEventListener("keypress", this, true);
		}

		if (aEvent.detail) // Tab moved to another window
			return;

		var window = tab.ownerDocument.defaultView;
		var gBrowser = window.gBrowser;
		var TST = gBrowser.treeStyleTab;

		var tabURI = tab.linkedBrowser.currentURI.spec;
		if (
			tabURI.startsWith('about:treestyletab-group')
			|| !TST.hasChildTabs(tab)
			|| TST.isSubtreeCollapsed(tab)
		)
			return;

		var parent = gBrowser.addTab('about:treestyletab-group?' + encodeURIComponent(tab.label), { skipAnimation: true });
		gBrowser.moveTabTo(parent, tab._tPos);
		TST.getChildTabs(tab).forEach(function(child) {
			TST.attachTabTo(child, parent);
		});

		var tabId = Date.now() + "-" + Math.random().toFixed(14).substr(2);
		// We handle "TabClose" from window in capturing phase, so this should happens before "SSTabClosing"
		this.ss.setTabValue(tab, this.tabKeyId, tabId);
		this.ss.setTabValue(parent, this.tabKeyParentId, tabId);
		this.ss.setTabValue(parent, this.tabKeyParentURI, tabURI);

		var browser = parent.linkedBrowser;
		browser.addEventListener("click", this, true);
		browser.addEventListener("keypress", this, true);
		this.loadStyles(true);
	},

	clickHandler: function(e) {
		if(e.button == 0)
			this.handleTabCommand(e);
	},
	keypressHandler: function(e) {
		if(e.keyCode == e.DOM_VK_RETURN)
			this.handleTabCommand(e);
	},
	handleTabCommand: function(e) {
		var trg = e.target;
		if(
			trg.className != "icon"
			|| !trg.ownerDocument.documentURI.startsWith("about:treestyletab-group")
		)
			return;
		var browser = e.currentTarget;
		var window = browser.ownerDocument.defaultView;
		var gBrowser = window.gBrowser;
		var tab = gBrowser._getTabForBrowser(browser);
		var parentId = this.ss.getTabValue(tab, this.tabKeyParentId);
		if(!parentId)
			return;

		try {
			var closedTabs = JSON.parse(this.ss.getClosedTabData(window));
			for(var i = 0, l = closedTabs.length; i < l; ++i) {
				var closedTab = closedTabs[i];
				var state = closedTab.state;
				if(
					"extData" in state
					&& this.tabKeyId in state.extData
					&& state.extData[this.tabKeyId] == parentId
				) {
					//this.ss.undoCloseTab(window, i);
					var newTab = window.undoCloseTab(i);
					gBrowser.removeTab(tab, { animate: false });
					window.setTimeout(function() {
						if(!newTab.selected)
							gBrowser.selectedTab = newTab;
					}, 0);
					return;
				}
			}
		}
		catch(e) {
			Components.utils.reportError(e);
		}

		var parentURI = this.ss.getTabValue(tab, this.tabKeyParentURI);
		if(parentURI)
			browser.loadURI(parentURI);
	}
};