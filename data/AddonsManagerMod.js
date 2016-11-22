/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var ACRController = {};

ACRController.addonReports = {};
ACRController.COMPATIBILITY_REPORT_URL_BASE = "https://addons.mozilla.org/compatibility/reporter/";

self.port.on("acr_init", function(data) {
    ACRController.exclamationImageURL = data.exclamationImageURL;
    ACRController.informationImageURL = data.informationImageURL;
    ACRController.warningImageURL = data.warningImageURL;
    ACRController.appE10sEnabled = data.appE10sEnabled;
    ACRController.addAppE10sStatus();
});

self.port.on("acr_refresh", function(data) {
    ACRController.onViewChanged();
});

self.port.on("acr_have_addon_report", function(addonReport) {

    /*console.log("[worker] Add-on '" + addonReport.guid + "/" + addonReport.version + "' state: '"
        + addonReport.state + "' compatibility: " + (addonReport.compatible?"IS":"IS NOT")
        + " compatible with this version of the platform.");*/

    ACRController.addonReports[addonReport.guid] = addonReport;
    gViewController.updateCommands();

    var ACRUI = ACRController.makeButtonUI(addonReport);

    if (!ACRUI)
        return;

    let listBox = gViewController.currentViewObj._listBox;
    if (listBox)
    {
        for (let elem of listBox.children)
        {
            if (elem.getAttribute("value") == addonReport.guid)
            {
                var controlContainer = document.getAnonymousElementByAttribute(elem, 'anonid', 'control-container');

                if (!controlContainer)
                    return;

                var existingACRUI = controlContainer.getElementsByAttribute("owner", "acr");

                try {
                    if (existingACRUI.length)
                        controlContainer.replaceChild(ACRUI, existingACRUI.item(0));
                    else if (controlContainer.childNodes.length > 0)
                        controlContainer.insertBefore(ACRUI, controlContainer.firstChild);
                    else
                        controlContainer.appendChild(ACRUI);
                } catch (e) {
                    console.error(String(e));
                }
            }
        }
    }
    else if (gViewController.viewPort.selectedPanel.id == "detail-view")
    {
        var existingACRUI = document.getElementById("detail-view").getElementsByAttribute("owner", "acr");

        if (existingACRUI.length)
            existingACRUI.item(0).parentNode.removeChild(existingACRUI.item(0));

        if (document.getElementById("detail-uninstall"))
            document.getElementById("detail-uninstall").parentNode.insertBefore(ACRUI, document.getElementById("detail-uninstall"));
        else if (document.getElementById("detail-enable-btn"))
            document.getElementById("detail-enable-btn").parentNode.insertBefore(ACRUI, document.getElementById("detail-enable-btn"));
    }
});

ACRController.onViewChanged = function() {
    //console.log("in view changed: " + gViewController.currentViewId);
    //console.log("addon count: " + document.getElementById("addon-list").itemCount);

    /*
    var existingACRUI = document.getElementsByAttribute("owner", "acr");

    for (var i=0;i<existingACRUI.length;i++)
        existingACRUI.item(i).parentNode.removeChild(existingACRUI.item(i));
    */

    let listBox = gViewController.currentViewObj._listBox;
    if (listBox) {
        for (let elem of listBox.children) {
            if (elem
                && elem.getAttribute("remote") === "false"
                && elem.getAttribute("type") === "extension") {
                self.port.emit("acr_have_addon", elem.getAttribute("value"));
            }
        }
    }
    else if (gDetailView._addon) {
        // console.log(gDetailView._addon.id);
        self.port.emit("acr_have_addon", gDetailView._addon.id);
    }
}

ACRController.makeButtonUI = function(addonReport) {
    var hbox_outer = document.createElement("hbox");
    hbox_outer.setAttribute("owner", "acr");
    hbox_outer.appendChild(this.makeE10sInfo(addonReport));

    if (addonReport.state == 2) {
        var hbox = document.createElement("hbox");
        hbox.setAttribute("align", "center");
        var image = document.createElement("image");
        image.setAttribute("width", "16");
        image.setAttribute("height", "16");
        image.setAttribute("src", this.exclamationImageURL);
        hbox.appendChild(image);
        var label = document.createElement("label");
        label.setAttribute("value", "Compatibility Problems"); // TODO l10n
        hbox.appendChild(label);

        hbox_outer.appendChild(hbox);
    } else {
        var button = document.createElement("button");
        button.setAttribute("label", "Report Issue");
        button.setAttribute("class", "anon-control");

        //button.addEventListener("click", function() { ACRController.openSendReportDialog(addonReport); }, true);
        button.addEventListener("click", function() {
            //ACRController.openSendReportDialog(addonReport);
            self.port.emit("acr_open_submit_report_dialog", addonReport);
        }, true);
        hbox_outer.appendChild(button);
    }
    return hbox_outer;
}

ACRController.makeE10sInfo = function(addonReport) {
    var hbox = document.createElement("hbox");
    hbox.setAttribute("owner", "acr");
    hbox.setAttribute("align", "center");
    var image = document.createElement("image");
    image.setAttribute("width", "16");
    image.setAttribute("height", "16");
    image.setAttribute("src", (addonReport.multiprocessCompatible ? this.informationImageURL : this.warningImageURL));
    hbox.appendChild(image);

    var label = document.createElement("label");
    label.setAttribute("value", (addonReport.multiprocessCompatible ? "Compatible" : "Not compatible") + " with multiprocess."); // TODO l10n
    hbox.appendChild(label);
    return hbox;
}

ACRController.addAppE10sStatus = function() {
    let hbox = document.createElement("hbox");
    hbox.style.paddingRight = "48px";

    let spacer = document.createElement("spacer");
    spacer.setAttribute("flex", "1");
    hbox.appendChild(spacer);

    let labelStatus = document.createElement("label");
    labelStatus.setAttribute("value", "Multiprocess is " + (this.appE10sEnabled ? "" : "not ") + "enabled.");
    labelStatus.style.fontWeight = "bold";
    labelStatus.style.marginBottom = "10px";
    hbox.appendChild(labelStatus);

    let labelLearnMore = document.createElement("label");
    labelLearnMore.classList.add("text-link");
    labelLearnMore.setAttribute("href", "https://wiki.mozilla.org/Firefox/multiprocess");
    labelLearnMore.setAttribute("value", "More information");
    hbox.appendChild(labelLearnMore);

    let addonList = document.getElementById("addon-list")
    addonList.parentNode.insertBefore(hbox, addonList);
}

//Services.obs.addObserver(init, "EM-loaded", false);
document.addEventListener("ViewChanged", ACRController.onViewChanged, true);

var overlayContextMenuItems = function() {

    var contextMenu = document.getElementById("addonitem-popup");
    if (contextMenu) {
        var showCompatibilityResults = document.createElement("menuitem");
        showCompatibilityResults.setAttribute("command", "cmd_showCompatibilityResults");
        showCompatibilityResults.setAttribute("label", "Show Compatibility Results");
        contextMenu.appendChild(showCompatibilityResults);

        var clearCompatibilityReport = document.createElement("menuitem");
        clearCompatibilityReport.setAttribute("command", "cmd_clearCompatibilityReport");
        clearCompatibilityReport.setAttribute("label", "Clear Compatibility Report");
        contextMenu.appendChild(clearCompatibilityReport);
    }
    else
        console.error("No #addonitem-popup element found.");

    var commandSet = document.getElementById("viewCommandSet");
    if (commandSet) {
        var c1 = document.createElement("command");
        c1.setAttribute("id", "cmd_showCompatibilityResults");
        commandSet.appendChild(c1);

        var c2 = document.createElement("command");
        c2.setAttribute("id", "cmd_clearCompatibilityReport");
        commandSet.appendChild(c2);

        gViewController.commands.cmd_showCompatibilityResults = {
            isEnabled: function(aAddon) {
                return aAddon != null && aAddon.type === "extension";
            },
            doCommand: function(aAddon) {
                openURL(ACRController.COMPATIBILITY_REPORT_URL_BASE + encodeURIComponent(aAddon.id));
            }
        };

        gViewController.commands.cmd_clearCompatibilityReport = {
            isEnabled: function(aAddon) {
                if (aAddon == null
                    || aAddon.type !== "extension"
                    || !ACRController.addonReports[aAddon.id]
                    || ACRController.addonReports[aAddon.id].state == 0)
                    return false;

                return true;
            },
            doCommand: function(aAddon) {
                if (aAddon)
                    self.port.emit("acr_clear_compatibility_report", aAddon.id);
            }
        };
    }
    else
        console.error("No #viewCommandSet element found.");
}

try {
    overlayContextMenuItems();
    ACRController.onViewChanged();
} catch (e) {
    // console.error(e) here winds up with a report about an empty
    // object, presumably due to structured clone not handling
    // Error objects, and the content-side console code not bothering
    // either.

    let msg = "A thing hath occurred: " + e;
    if (e.stack)
        msg += "\n" + e.stack
}
