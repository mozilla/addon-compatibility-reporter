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
const panel = require("panel");
const ACR = require("acr");
const AddonManager = Cu.import("resource://gre/modules/AddonManager.jsm").AddonManager;
const obsService = require("observer-service");

ACR.setAMOShowIncompatibleAddons();
ACR.checkForCompatibilityReset();
//ACR.checkForLangPackDisable();
ACR.registerAddonListener();

chromeMod.ChromeMod(
{
    include: "about:addons",
    contentScriptWhen: 'end',
    contentScriptFile: self.data.url("AddonsManagerMod.js"),
    onAttach: function(worker) {
        worker.port.emit("init", {exclamationImageURL: self.data.url("exclamation.png")});
        worker.port.on("acr_have_addon", function(guid) { addonHandler(guid, worker); });
        worker.port.on("acr_open_submit_report_dialog", function(addonReport) { openSubmitReportDialog(addonReport, worker); });
        worker.port.on("acr_clear_compatibility_report", function(guid) { clearCompatibilityReport(guid, worker); });

        obsService.add("acr_addonreport_updated", function(addonReport)
        {
            worker.port.emit("acr_have_addon_report", ACR.AddonReportStorage.getAddonReport(addonReport.guid, addonReport.version));
            // TODO how to remove this observer?
        });
    }
});

function openSubmitReportDialog(addonReport, worker)
{
    var submitReport = panel.Panel({
        contentURL: self.data.url("submitreport.htm"),
        contentScriptFile: self.data.url("submitreport.js"),
        width: 450,
        height: 500
    })

    var data = {
        guid: addonReport.guid,
        addon: addonReport.name + " " + addonReport.version,
        application: ACR.Util.getFullApplicationString(),
        operatingSystem: ACR.Util.getFullOSString()
    };

    submitReport.port.on("submit_report", function(submitData)
    {
        ACR.Logger.log("about to submit report for: " +submitData.guid);

        var cb = function(response)
        {
            if (response == null)
            {
                submitReport.port.emit("submit_report_error");
            }
            else
            {
                if (submitData.disableAddon)
                    ACR.disableAddon(addonReport);

                submitReport.port.emit("submit_report_success");

                worker.port.emit("acr_have_addon_report", ACR.AddonReportStorage.getAddonReport(addonReport.guid, addonReport.version));
            }
        };

        ACR.submitReport(addonReport,
            false,
            submitData.details,
            submitData.includeAddons,
            cb);
    });
    
    submitReport.port.emit("init", data);
    submitReport.show();
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

obsService.add("acr_uninstalled", reloadAllAddonsManagerTabs);

//Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator).getMostRecentWindow("navigator:browser").moveBy(400,0);

ACR.Logger.log("ACR is running.");

