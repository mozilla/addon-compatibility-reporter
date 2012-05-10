/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Add-on Compatibility Reporter.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Corporation.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s): David McNamara
 *                 Brian King
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const {Cc, Ci, Cu} = require("chrome");
const self = require("self");
const chromeMod = require("chrome-mod");
const prefService = require("preferences-service");
const windows = require("windows");
const tabs = require("tabs");
const panel = require("panel");
const ACR = require("acr");
const AddonManager = Cu.import("resource://gre/modules/AddonManager.jsm").AddonManager;
const obsService = require("observer-service");
const widgets = require("widget");
const ss = require("simple-storage");
const timers = require("timers");

const ALLOW_REPEAT_SUBMISSION = true;
const PROMPT_CHECK_STARTUP = 1000*60*10; // after startup, check for 3-week expiry after 10 minutes
const PROMPT_CHECK_INTERVAL = 1000*60*60; // then check for 3-week expiry ever hour

ACR.setAMOShowIncompatibleAddons();
ACR.registerAddonListener();
ACR.doUpgradeChecks();

var checkForPromptTimeout = function() {
    if (ss.storage.userClosedPanelCounter>=2)
        return;

    ACR.checkForPromptTimeout(showWidgetPanel);
}

if (!ss.storage.userClosedPanelCounter || ss.storage.userClosedPanelCounter<2) {
    timers.setTimeout(checkForPromptTimeout, PROMPT_CHECK_STARTUP);
    timers.setInterval(checkForPromptTimeout, PROMPT_CHECK_INTERVAL);
}

try {
    chromeMod.ChromeMod(
    {
        include: "about:addons",
        contentScriptWhen: 'end',
        contentScriptFile: self.data.url("AddonsManagerMod.js"),
        onAttach: function(worker) {
            worker.port.emit("acr_init", {exclamationImageURL: self.data.url("image/exclamation.png")});
            worker.port.on("acr_have_addon", function(guid) { addonHandler(guid, worker); });
            worker.port.on("acr_open_submit_report_dialog", function(addonReport) { openSubmitSingleReportDialog(addonReport, worker); });
            worker.port.on("acr_clear_compatibility_report", function(guid) { clearCompatibilityReport(guid, worker); });

            obsService.add("acr_addonreport_updated", function(addonReport)
            {
                try {
                    worker.port.emit("acr_have_addon_report", addonReport);
                } catch(e) { ACR.Logger.warn("Could not notify addons manager: " + e); }

                // give UI time to draw
                timers.setTimeout(function() {
                    try {
                        worker.port.emit("acr_have_addon_report", addonReport);
                    } catch(e) { ACR.Logger.warn("Could not notify addons manager: " + e); }
                }, 1000);
            });

            /*
            obsService.add("acr_install_change", function()
            {
                worker.port.emit("acr_refresh");
                // TODO how to remove this observer?
            });
            */
        }
    });
} catch (e) { ACR.Logger.warn("Possibly harmless chrome mod error: " + e); }

function openSubmitSingleReportDialog(addonReport, worker)
{
    var submitReportPanel = panel.Panel({
        contentURL: self.data.url("submitsinglereport.htm"),
        contentScriptFile: self.data.url("submitsinglereport.js"),
        width: 390,
        height: 260
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
        obsService.notify("acr_addonreport_updated", addonReport);
    });

    submitReportPanel.port.on("user_closed_panel", function()
    {
        submitReportPanel.hide();
    });

    submitReportPanel.port.on("submit_report", function(submitData)
    {
        ACR.Logger.log("about to submit report for: " +submitData.guid);

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
        data.iconURL = addon.iconURL;
        submitReportPanel.port.emit("init", data);
        submitReportPanel.show();
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
    obsService.remove("acr_install_change", acrInstallChange);
}

obsService.add("acr_install_change", acrInstallChange);

var showAddonsBar = function() {
    var wm = Cc["@mozilla.org/appshell/window-mediator;1"]  
        .getService(Ci.nsIWindowMediator);  
    var win = wm.getMostRecentWindow("navigator:browser");  
    win.document.getElementById("addon-bar").collapsed = false;
};

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

    showAddonsBar();

    prefService.set("extensions.acr.donefirstrun", true);
}

var reporterPanel = panel.Panel({
    width: 380,
    height: 230, // also change below
    contentURL: self.data.url("reporter.htm"),
    contentScriptFile: [self.data.url("reporter.js"),
        self.data.url("lib/jquery-1.7.2.min.js"),
        self.data.url("lib/jquery-ui-1.8.19.custom.min.js")]
});

reporterPanel.sendAddonReports = function() {
    AddonManager.getAllAddons(function(addons) {
        var addonReports = [];
        for (var i=0; i<addons.length; i++) {
            if (addons[i].type != "extension") // TODO also list themes?
                continue;
            var addonReport = ACR.AddonReportStorage.getAddonReportByAddon(addons[i]);
            if (addons[i].iconURL)
                addonReport.iconURL = addons[i].iconURL;
            else
                addonReport.iconURL = self.data.url("image/extensionGeneric.png");
            if (!addons[i].isActive && addonReport.state == 0)
                addonReport.state = 3;
            if (addonReport.state == 0)
                addonReport.state = 1;
            addonReport.isDisabled = !addons[i].isActive;
            addonReports.push(addonReport);
        }

        var by = addonReports.length*55;
        if (by>220)
            by=220;
        if (by<110)
            by=110;
        reporterPanel.resize(reporterPanel.width, 230+(by-110));
        reporterPanel.port.emit("set_scroller_height", (by-10));

        reporterPanel.port.emit("have_addon_reports", addonReports);
    });
}

reporterPanel.on("show", function() {
    reporterPanel.sendAddonReports(true);

    ACR.Logger.debug("adding reporterPanel.addonReportUpdatedObserver");
    obsService.add("acr_addonreport_updated", reporterPanel.sendAddonReports);
});

reporterPanel.on("hide", function() {
    ACR.Logger.debug("removing reporterPanel.addonReportUpdatedObserver");
    obsService.remove("acr_addonreport_updated", reporterPanel.sendAddonReports);
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
                    obsService.notify("acr_addonreport_updated", addonReports[ix]);
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

    timers.setTimeout(function() { submit(0); }, 1000);
});

var widget = widgets.Widget({
    id: "acr-dialog",
    label: "Addon Compatibility Reporter",
    contentURL: self.data.url("image/extensionGeneric-16.png"),
    panel: reporterPanel
});

var showWidgetPanel = function() {
    //ACR.Logger.log("showing widget panel");
    // hack to show an anchored widget panel
    var wm = Cc["@mozilla.org/appshell/window-mediator;1"]  
        .getService(Ci.nsIWindowMediator);  
    var win = wm.getMostRecentWindow("navigator:browser");  

    var evt = win.document.createEvent("MouseEvents");
      evt.initMouseEvent("click", true, true, win,
          0, 0, 0, 0, 0, false, false, false, false, 0, null);

    win.document.getElementById("addon-bar").collapsed = false;
    win.document.getElementById("widget:"+self.id+"-acr-dialog").firstElementChild.contentDocument.getElementsByTagName("img")[0].dispatchEvent(evt);
};

ACR.Logger.log("ACR is running.");

//Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator).getMostRecentWindow("navigator:browser").moveBy(300,0);

