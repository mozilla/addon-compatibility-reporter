/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cc, Ci, Cu} = require("chrome");
const self = require("sdk/self");
const prefService = require("sdk/preferences/service");
const windows = require("sdk/windows");
const tabs = require("sdk/tabs");
const panel = require("sdk/panel");
const ACR = require("./acr");
const { AddonManager } = Cu.import("resource://gre/modules/AddonManager.jsm", {});
const events = require("sdk/system/events");
const ss = require("sdk/simple-storage");
const { setTimeout } = require("sdk/timers");
const { XMLHttpRequest } = require("sdk/net/xhr");
const base64 = require("sdk/base64");

if (ACR.Util.getHostEnvironmentInfo().appVersion.compare("30.0") < 0)
    var { Widget } = require("sdk/widget");
else
    var { ToggleButton } = require("sdk/ui/button/toggle");

if (ACR.Util.getHostEnvironmentInfo().appVersion.compare("39.0") < 0)
    var { ChromeMod } = require("./chrome-mod");
else
    var { ChromeMod } = require("./chrome-page-mod");

const ALLOW_REPEAT_SUBMISSION = true;

ACR.setAMOShowIncompatibleAddons();
ACR.registerAddonListener();
ACR.doUpgradeChecks();
ACR.checkForPromptTimeout();

var genericAddonIconURL = (function()
{
    let os = ACR.Util.getHostEnvironmentInfo().osName;
    switch (os)
    {
        case "WINNT":
            // special handling for Aero?
            break;
        case "Linux":
        case "Darwin":
            break;
        default:
            // Most other OSes will be *nix based
            os = "Linux";
            break;
    }
    return self.data.url("image/extensionGeneric-"+os+".png");
})();

try {
    ChromeMod({
        include: "about:addons",
        contentScriptWhen: 'end',
        contentScriptFile: self.data.url("AddonsManagerMod.js"),
        onAttach: function(worker) {
            worker.port.emit("acr_init", {exclamationImageURL: self.data.url("image/exclamation.png")});
            worker.port.on("acr_have_addon", function(guid) { addonHandler(guid, worker); });
            worker.port.on("acr_open_submit_report_dialog", function(addonReport) { openSubmitSingleReportDialog(addonReport, worker); });
            worker.port.on("acr_clear_compatibility_report", function(guid) { clearCompatibilityReport(guid, worker); });

            events.on("acr_addonreport_updated", onAddonReportUpdated, true);
            events.on("acr_install_change", onInstallChange);
            worker.on('detach', () => {
                events.off("acr_addonreport_updated", onAddonReportUpdated);
                events.off("acr_install_change", onInstallChange);
            });

            function onAddonReportUpdated({ subject: addonReport })
            {
                worker.port.emit("acr_have_addon_report", addonReport);

                // give UI time to draw
                setTimeout(function() {
                    worker.port.emit("acr_have_addon_report", addonReport);
                }, 1000);
            }

            function onInstallChange() {
                worker.port.emit("acr_refresh");
            }
        }
    });
} catch (e) {
    ACR.Logger.warn("Possibly harmless chrome mod error: " + e);
    console.error(e);
}

function openSubmitSingleReportDialog(addonReport, worker)
{
    var submitReportPanel = panel.Panel({
        contentURL: self.data.url("submitsinglereport.htm"),
        contentScriptFile: self.data.url("submitsinglereport.js"),
        width: 430,
        height: 250
    });

    var data = {
        guid: addonReport.guid,
        addon: addonReport.name,
        version: addonReport.version,
        details: addonReport.report,
        application: ACR.Util.getFullApplicationString(),
        operatingSystem: ACR.Util.getFullOSString()
    };

    submitReportPanel.port.on("save_details", function(details)
    {
        addonReport.report = details;
        ACR.AddonReportStorage.saveAddonReport(addonReport);
        events.emit("acr_addonreport_updated", { subject: addonReport });
    });

    submitReportPanel.port.on("user_closed_panel", function()
    {
        submitReportPanel.hide();
    });

    submitReportPanel.port.on("submit_report", function(submitData)
    {
        ACR.Logger.log("about to submit report for: " +submitData.guid);

        submitReportPanel.resize(submitReportPanel.width, 250);

        var cb = function(response)
        {
            if (response == null)
            {
                submitReportPanel.port.emit("submit_report_error");
            }
            else
            {
                if (submitData.disableAddon)
                    ACR.disableAddon(addonReport);

                submitReportPanel.port.emit("submit_report_success");

                worker.port.emit("acr_have_addon_report", ACR.AddonReportStorage.getAddonReport(addonReport.guid, addonReport.version));
            }
        };

        ACR.submitReport(addonReport,
            false,
            submitData.details,
            submitData.includeAddons,
            "Add-ons Manager",
            cb);
    });

    AddonManager.getAddonByID(addonReport.guid, function(addon)
    {
        retrieveAddonIcon(addon, function callback(addon) {
            data.panelHeight = submitReportPanel.height/4;
            data.icon = addon.icon;
            submitReportPanel.port.emit("init", data);
            submitReportPanel.show();
        });
    });
}

function addonHandler(guid, worker)
{
    ACR.Logger.log("have addon: " + guid);

    var cb = function(addon)
    {
        if (!addon)
            return;

        var addonReport = ACR.AddonReportStorage.getAddonReportByAddon(addon);

        ACR.Logger.log("[main] Add-on '" + addonReport.guid + "/" + addonReport.version + "' state: '"
            + addonReport.state + "' compatibility: " + (addonReport.compatible?"IS":"IS NOT")
            + " compatible with this version of the platform.");

        worker.port.emit("acr_have_addon_report", addonReport);
    }

    AddonManager.getAddonByID(guid, cb);
}

function clearCompatibilityReport(guid, worker)
{
    ACR.Logger.log("clearing compatibility report for " + guid);

    var cb = function(addon)
    {
        if (!addon)
            return;

        var addonReport = ACR.AddonReportStorage.getAddonReportByAddon(addon);
        ACR.AddonReportStorage.deleteAddonReport(addonReport);
        addonReport = ACR.AddonReportStorage.getAddonReportByAddon(addon);

        worker.port.emit("acr_have_addon_report", addonReport);
    }

    AddonManager.getAddonByID(guid, cb);
}

// catch case when addons manager is open during install
function reloadAllAddonsManagerTabs()
{
    for each (var window in windows.browserWindows)
        for each (var tab in window.tabs)
            if (tab.url == "about:addons")
                tab.reload();
}
reloadAllAddonsManagerTabs();

var acrInstallChange = function()
{
    //console.log("in acrInstallChange");
    reloadAllAddonsManagerTabs();
}

events.once("acr_install_change", acrInstallChange);

if (!prefService.isSet("extensions.acr.donefirstrun"))
{
    switch (ACR.Util.getHostEnvironmentInfo().appName)
    {
        case "Firefox":
        case "SeaMonkey":
            tabs.open(ACR.FIRSTRUN_LANDING_PAGE);
            break;
        case "Thunderbird":
            tabs.open(ACR.FIRSTRUN_LANDING_PAGE_TB);
            break;
    }

    prefService.set("extensions.acr.donefirstrun", true);
}

var reporterPanel = panel.Panel({
    width: 420,
    height: 230, // also change below
    contentURL: self.data.url("reporter.htm"),
    contentScriptFile: [self.data.url("reporter.js"),
        self.data.url("lib/jquery-1.7.2.min.js"),
        self.data.url("lib/jquery-ui-1.8.19.custom.min.js")],
    onHide: function() {
        if (widget.state)
            widget.state('window', { checked: false });
    }
});

function retrieveAddonIcon(addon, callback) {
    if (!addon.iconURL) {
        addon.icon = genericAddonIconURL;
        callback(addon);
    } else {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (this.readyState === 4) {
            addon.icon = 'data:image/png;base64,' + base64.encode(String.fromCharCode.apply(null, new Uint8Array(this.response)));
            callback(addon);
            }
        }
        xhr.open('GET', addon.iconURL, true);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
    }
}

reporterPanel.sendAddonReports = function() {
    AddonManager.getAllAddons(function(addons) {
        var addonReports = [];
        var reportsProcessed = 0;
        var addonsCount = 0;
        for (let addon of addons) {
            if (addon.type === "extension" && !addon.isSystem && addon.isActive) {
                addonsCount++;
                retrieveAddonIcon(addon, function callback(addon) {
                    var addonReport = ACR.AddonReportStorage.getAddonReportByAddon(addon);
                    addonReport.icon = addon.icon;
                    if (!addon.isActive && addonReport.state == 0)
                        addonReport.state = 3;
                    if (addonReport.state == 0)
                        addonReport.state = 1;
                    addonReport.isDisabled = !addon.isActive;
                    addonReport.multiprocessCompatible = addon.multiprocessCompatible;
                    addonReports.push(addonReport);
                    reportsProcessed++;

                    if (reportsProcessed === addonsCount) {
                        var by = addonReports.length*55;
                        if (by>220)
                            by=220;
                        if (by<110)
                            by=110;
                        let panelSize = 240+(by-110);
                        let scrollSize = (by);
                        ACR.Logger.log("Panel size = "+panelSize);
                        ACR.Logger.log("Scroll size = "+scrollSize);
                        reporterPanel.resize(reporterPanel.width, panelSize);
                        reporterPanel.port.emit("set_scroller_height", scrollSize);
                        reporterPanel.port.emit("have_addon_reports", addonReports);
                        reporterPanel.port.emit("app_e10s_enabled", ACR.Util.getHostEnvironmentInfo().multiprocessEnabled);
                    }
                });
            }
        }
    });
}

reporterPanel.on("show", function() {
    reporterPanel.sendAddonReports();

    ACR.Logger.debug("adding reporterPanel.addonReportUpdatedObserver");
    events.on("acr_addonreport_updated", reporterPanel.sendAddonReports);
});

reporterPanel.on("hide", function() {
    ACR.Logger.debug("removing reporterPanel.addonReportUpdatedObserver");
    events.off("acr_addonreport_updated", reporterPanel.sendAddonReports);
});

reporterPanel.port.on("resize_panel", function(by) {
});

reporterPanel.port.on("user_closed_panel", function(hasAnsweredQuestions) {
    if (!hasAnsweredQuestions)
        ss.storage.userClosedPanelCounter++;

    reporterPanel.hide();
});

reporterPanel.port.on("save_report", function(addonReport) {
    ACR.AddonReportStorage.saveAddonReport(addonReport);
});

reporterPanel.port.on("submit_reports", function(addonReports) {

    //reset panel after x seconds
    setTimeout(function() { reporterPanel.port.emit("reset"); }, 60*1000);

    var submit = function(i) {
        var makeCB = function() {
            let ix = i;
            return function(response) {
                if (response == null) {
                    ACR.Logger.log("have submit error, aborting ");
                    reporterPanel.port.emit("submit_report_error");
                    return;
                } else {
                    ACR.AddonReportStorage.saveAddonReport(addonReports[ix]);
                    events.emit("acr_addonreport_updated", { subject: addonReports[ix] });
                    reporterPanel.port.emit("submitted_report", addonReports[ix]);
                }

                if (ix < addonReports.length-1) {
                    submit(ix+1);
                }
            }
        }

        if (ALLOW_REPEAT_SUBMISSION || !addonReports[i].hasSubmitted) {
            if (addonReports[i].state == 1 || addonReports[i].state == 2) {
                ACR.Logger.log("about to submit report for: " + addonReports[i].guid);
                ACR.submitReport(addonReports[i],
                    (addonReports[i].state == 1),
                    addonReports[i].report,
                    false,
                    null,
                    makeCB());
            } else {
                (makeCB())(1);
            }
        } else {
            (makeCB())(1);
        }
    }

    setTimeout(function() { submit(0); }, 1000);
});

reporterPanel.port.on("openE10sIntroLink", function() {
    tabs.open("https://wiki.mozilla.org/Firefox/multiprocess");
});

let os = ACR.Util.getHostEnvironmentInfo().osName;
if (!["WINNT", "Linux", "Darwin"])
    // Most other OSes will be *nix based
    os = "Linux";

if (Widget) {
    var widget = Widget({
        id: "acr-dialog",
        label: "Addon Compatibility Reporter",
        contentURL: self.data.url("image/extensionGeneric-16-" + os + ".png"),
        panel: reporterPanel
    });
}
else {
    widget = ToggleButton({
        id: "acr-dialog",
        label: "Addon Compatibility Reporter",
        icon: {
            "16": self.data.url("image/extensionGeneric-16-" + os + ".png"),
            "32": self.data.url("image/extensionGeneric-" + os + ".png"),
        },
        onChange: function(state) {
            if (state.checked)
                reporterPanel.show({ position: widget });
        }
    });
}

var showWidgetPanel = function() {
    if (ToggleButton)
        widget.click();
    else {
        //ACR.Logger.log("showing widget panel");
        // hack to show an anchored widget panel
        var win = require("sdk/window/utils").getMostRecentBrowserWindow();

        var evt = win.document.createEvent("MouseEvents");
        evt.initMouseEvent("click", true, true, win,
              0, 0, 0, 0, 0, false, false, false, false, 0, null);

        let widget = win.document.getElementById("widget:"+self.id+"-acr-dialog");
        if (widget)
            widget.firstElementChild.contentDocument.getElementsByTagName("img")[0].dispatchEvent(evt);
    }
};

events.on("acr_prompt_for_reports", function () {
    if ((ss.storage.userClosedPanelCounter || 0) < 2)
        showWidgetPanel();
}, true);

ACR.Logger.log("ACR is running.");

//Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator).getMostRecentWindow("navigator:browser").moveBy(300,0);

