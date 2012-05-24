/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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
