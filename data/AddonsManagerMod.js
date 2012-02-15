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

console.log("in addonsManagerMod");

/*
function loaded() 
{
    console.log("in loaded");

    try
    {
        console.log(gViewController.currentViewId);
    }
    catch (e)
    {
        console.error(e);
    }
}
*/

ACRController = {};

ACRController.onViewChanged = function()
{
    console.log("in view changed: " + gViewController.currentViewId);
    //console.log("addon count: " + document.getElementById("addon-list").itemCount);

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

ACRController.makeButtonUI = function(addonReport)
{
    // TODO: make nolongerworks UI instead if user has already submitted

    var button = document.createElement("button");
    button.setAttribute("label", "Report Incompatibility");
    button.setAttribute("type", "menu");
    button.setAttribute("class", "anon-control");

    //button.addEventListener("click", function() { ACRController.openSendReportDialog(addonReport); }, true);

    return button;
}

/*
ACRController.openSendReportDialog = function(addonReport)
{
    window.openDialog("about:blank", "chrome,titlebar,centerscreen,modal");

    window.addEventListener("load", function() {
        var doc = window.contentDocument;
        var label = doc.createElement("label");
        label.setAttribute("value", "test");
    }, true);
}
*/

//Services.obs.addObserver(init, "EM-loaded", false);

document.addEventListener("ViewChanged", ACRController.onViewChanged, true);

self.port.on("acr_have_addon_report", function(addonReport) {

    console.log("[worker] Add-on '" + addonReport.guid + "/" + addonReport.version + "' state: '"
        + addonReport.state + "' compatibility: " + (addonReport.compatible?"IS":"IS NOT")
        + " compatible with this version of the platform.");
    
    for (var i=0; i<gViewController.currentViewObj._listBox.itemCount; i++)
    {
        var elem = gViewController.currentViewObj._listBox.getItemAtIndex(i);

        if (elem.getAttribute("value") == addonReport.guid) 
        {
            if (gViewController.viewPort.selectedPanel.id == "list-view")
            {
                var controlContainer = document.getAnonymousElementByAttribute(elem, 'anonid', 'control-container');
                controlContainer.insertBefore(ACRController.makeButtonUI(addonReport), controlContainer.firstChild);
            }
            else if (gViewController.viewPort.selectedPanel.id == "details-view")
            {
                // TODO
            }
        }
    }


});
