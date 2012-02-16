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

//console.log("in addonsManagerMod");

ACRController = {};

ACRController.addonReports = {};
ACRController.COMPATIBILITY_REPORT_URL_BASE = "https://addons.mozilla.org/en-US/firefox/compatibility/reporter/";

self.port.on("init", function(data) {

    ACRController.exclamationImageURL = data.exclamationImageURL;
});

self.port.on("acr_have_addon_report", function(addonReport) {

    /*console.log("[worker] Add-on '" + addonReport.guid + "/" + addonReport.version + "' state: '"
        + addonReport.state + "' compatibility: " + (addonReport.compatible?"IS":"IS NOT")
        + " compatible with this version of the platform.");*/

    ACRController.addonReports[addonReport.guid] = addonReport;
    gViewController.updateCommands();
    
    var ACRUI = ACRController.makeButtonUI(addonReport);

    if (gViewController.currentViewObj._listBox) 
    {
        for (var i=0; i<gViewController.currentViewObj._listBox.itemCount; i++)
        {
            var elem = gViewController.currentViewObj._listBox.getItemAtIndex(i);

            if (elem.getAttribute("value") == addonReport.guid) 
            {
                var controlContainer = document.getAnonymousElementByAttribute(elem, 'anonid', 'control-container');

                if (!controlContainer)
                    return;

                var existingACRUI = controlContainer.getElementsByAttribute("owner", "acr");

                if (existingACRUI.length)
                    controlContainer.replaceChild(ACRUI, existingACRUI.item(0));
                else
                    controlContainer.insertBefore(ACRUI, controlContainer.firstChild);
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

ACRController.onViewChanged = function()
{
    //console.log("in view changed: " + gViewController.currentViewId);
    //console.log("addon count: " + document.getElementById("addon-list").itemCount);

    if (gViewController.currentViewObj._listBox) 
    {
        for (var i=0; i<gViewController.currentViewObj._listBox.itemCount; i++)
        {
            var elem = gViewController.currentViewObj._listBox.getItemAtIndex(i);

            if (!elem
                || elem.getAttribute("remote") == "true"
                || elem.getAttribute("plugin") == "true"
                || elem.getAttribute("lwtheme") == "true"
                || elem.getAttribute("type") == "plugin")
                continue;

            self.port.emit("acr_have_addon", elem.getAttribute("value"));
        }
    }
    else if (gDetailView._addon)
    {
        console.log(gDetailView._addon.id);
        self.port.emit("acr_have_addon", gDetailView._addon.id);
    }
}

ACRController.makeButtonUI = function(addonReport)
{
    if (addonReport.state == 0)
    {
        var button = document.createElement("button");
        button.setAttribute("label", "Report Incompatibility");
        button.setAttribute("type", "menu");
        button.setAttribute("class", "anon-control");
        button.setAttribute("owner", "acr");

        //button.addEventListener("click", function() { ACRController.openSendReportDialog(addonReport); }, true);
        button.addEventListener("click", function()
        {
            //ACRController.openSendReportDialog(addonReport);
            self.port.emit("acr_open_submit_report_dialog", addonReport);
        }, true);

        return button;
    }
    else if (addonReport.state == 1)
    {
        // addon report cannot be "marked as compatible" in this version of the ACR
        console.error("Addon report in unsupported state (1)");
    }
    else if (addonReport.state == 2)
    {
        var hbox = document.createElement("hbox");
        hbox.setAttribute("owner", "acr");
        hbox.setAttribute("align", "center");
        var image = document.createElement("image");
        image.setAttribute("width", "16");
        image.setAttribute("height", "16");
        image.setAttribute("src", this.exclamationImageURL);
        hbox.appendChild(image);
        var label = document.createElement("label");
        label.setAttribute("value", "Compatibility Problems");
        hbox.appendChild(label);

        return hbox;
    }
}

//Services.obs.addObserver(init, "EM-loaded", false);
document.addEventListener("ViewChanged", ACRController.onViewChanged, true);

gViewController.commands.cmd_showCompatibilityResults = {
    isEnabled: function(aAddon) {
        return aAddon != null && aAddon.type != "plugin" && aAddon.type != "lwtheme";
    },
    doCommand: function(aAddon) {
        openURL(ACRController.COMPATIBILITY_REPORT_URL_BASE + encodeURIComponent(aAddon.id));
    }
};

gViewController.commands.cmd_clearCompatibilityReport = {
    isEnabled: function(aAddon) {   
        if (aAddon == null 
            || aAddon.type == "plugin"
            || aAddon.type == "lwtheme"
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

var contextMenu = document.getElementById("addonitem-popup");

var showCompatibilityResults = document.createElement("menuitem");
showCompatibilityResults.setAttribute("command", "cmd_showCompatibilityResults");
showCompatibilityResults.setAttribute("label", "Show Compatibility Results");
contextMenu.appendChild(showCompatibilityResults);

var clearCompatibilityReport = document.createElement("menuitem");
clearCompatibilityReport.setAttribute("command", "cmd_clearCompatibilityReport");
clearCompatibilityReport.setAttribute("label", "Clear Compatibility Report");
contextMenu.appendChild(clearCompatibilityReport);

var commandSet = document.getElementById("viewCommandSet");
var c1 = document.createElement("command");
c1.setAttribute("id", "cmd_showCompatibilityResults");
commandSet.appendChild(c1);

var c2 = document.createElement("command");
c2.setAttribute("id", "cmd_clearCompatibilityReport");
commandSet.appendChild(c2);

