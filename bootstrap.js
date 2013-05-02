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
			case "TabClose": this.tabCloseHandler(e);
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

		window.addEventListener("TabClose", this, false);
	},
	destroyWindow: function(window, reason) {
		window.removeEventListener("load", this, false); // Window can be closed before "load"
		if(reason == WINDOW_CLOSED && !this.isTargetWindow(window))
			return;

		window.removeEventListener("TabClose", this, false);
	},
	isTargetWindow: function(window) {
		return window.document.documentElement.getAttribute("windowtype") == "navigator:browser";
	},

	tabCloseHandler: function(aEvent) {
		if (aEvent.detail) // Tab moved to another window
			return;

		var tab = aEvent.originalTarget;
		var window = tab.ownerDocument.defaultView;
		var gBrowser = window.gBrowser;
		var TST = gBrowser.treeStyleTab;

		if (
			tab.linkedBrowser.currentURI.spec.startsWith('about:treestyletab-group')
			|| !TST.hasChildTabs(tab)
			|| TST.isSubtreeCollapsed(tab)
		)
			return;

		var parent = gBrowser.addTab('about:treestyletab-group?' + encodeURIComponent(tab.label), { skipAnimation: true });
		gBrowser.moveTabTo(parent, tab._tPos);
		TST.getChildTabs(tab).forEach(function(child) {
			TST.attachTabTo(child, parent);
		});
	}
};