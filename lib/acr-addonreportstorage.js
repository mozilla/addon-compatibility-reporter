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

const {Cc,Ci,Cu} = require("chrome");
const ss = require("simple-storage");
const Logger = require("acr-logger");

exports.getAddonReport = function(guid, version)
{
    Logger.debug("AddonReportStorage.getAddonReport(): Getting addonReport guid = '" + guid + "', version = '" + version + "'");

    var id = guid + "/" + version;

    var map = ss.storage.addonReports;

    if (map && map[id])
        return map[id];

    return {guid: guid, name: "", version: version, state: 0, report: "", newstate: 0, hasSubmitted: false};
}

exports.getAddonReportByAddon = function(addon)
{
    var addonReport = this.getAddonReport(addon.id, addon.version);
    addonReport.compatible = addon.isCompatible;
    addonReport.name = addon.name;

    return addonReport;
}

exports.saveAddonReport = function(addonReport)
{
    Logger.debug("AddonReportStorage.saveAddonReport(): Saving addonReport guid = '" +
        addonReport.guid + "', version = '" + addonReport.version + "', report = '" + addonReport.report + "'");

    var id = addonReport.guid + "/" + addonReport.version;

    if (!ss.storage.addonReports)
        ss.storage.addonReports = {};

    var map = ss.storage.addonReports;

    map[id] = addonReport;
}

exports.deleteAddonReport = function(addonReport)
{
    Logger.debug("AddonReportStorage.deleteAddonReport(): Deleting addonReport guid = '" + addonReport.guid + "', version = '" + addonReport.version);

    var id = addonReport.guid + "/" + addonReport.version;

    var map = ss.storage.addonReports;
    delete map[id];
}

exports.clearAllAddonReports = function()
{
    ss.storage.addonReports = {};
}
