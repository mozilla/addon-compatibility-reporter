/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cc,Ci,Cu} = require("chrome");
const prefService = require("preferences-service");
const obsService = require("observer-service");
const ss = require("simple-storage");
const self = require("self");

const PROMPT_TIMEOUT = 1000*60*60*24*21; // 3 week timeout
//const PROMPT_TIMEOUT = 1000*60*9; // 9 minute timeout

if (!prefService.has("extensions.acr.amo_host") || prefService.get("extensions.acr.amo_host") == "")
{
    prefService.set("extensions.acr.amo_host", "addons.mozilla.org");
}

if (!prefService.has("extensions.acr.donefirstrun"))
{
    // first run
    prefService.set("extensions.acr.previousApplicationVersion", "");
    prefService.set("extensions.acr.debug", true);
    prefService.set("extensions.acr.verbose", true);

    ss.storage.addons = {};
    ss.storage.addonReports = {};
}

const Logger = require("acr-logger");
const Util = require("acr-util");
const AddonReportStorage = require("acr-addonreportstorage");
const API = require("acr-api");
const AddonManager = Cu.import("resource://gre/modules/AddonManager.jsm").AddonManager;

exports.Logger = Logger;
exports.Util = Util;
exports.AddonReportStorage = AddonReportStorage;

const SHOW_INCOMPATIBLE_ADDONS_STORAGE_ORIGIN = "https://addons.mozilla.org";
const SHOW_INCOMPATIBLE_ADDONS_STORAGE_NAME = "ShowIncompatibleAddons";

exports.FIRSTRUN_LANDING_PAGE = "https://%%AMO_HOST%%/compatibility_firstrun".
    replace("%%AMO_HOST%%", prefService.get("extensions.acr.amo_host"));
exports.FIRSTRUN_LANDING_PAGE_TB = "https://%%AMO_HOST%%/thunderbird/compatibility_firstrun".
    replace("%%AMO_HOST%%", prefService.get("extensions.acr.amo_host"));

exports.submitReport = function(addonReport, stillWorks, details, includeOtherAddons, source, callback)
{
    Logger.debug("In ACR.submitReport()");

    var submitReport = function(installedExtensions)
    {
        details = details.trim();

        var otherAddons = [];

        for (var i=0; i<installedExtensions.length; i++)
        {
            otherAddons.push([installedExtensions[i].id, installedExtensions[i].version]);
        }

        var envInfo = Util.getHostEnvironmentInfo();

        var internalCallback = function(response)
        {
            if (response != null)
            {
                addonReport.state = (stillWorks ? 1 : 2);
                addonReport.report = details;
                addonReport.hasSubmitted = true;
                AddonReportStorage.saveAddonReport(addonReport);
            }

            callback(response);
        };

        API.submitReport(
            addonReport.guid,
            addonReport.version,
            stillWorks,
            envInfo.appGUID,
            envInfo.appVersion,
            envInfo.appBuildID,
            envInfo.osVersion,
            details,
            otherAddons,
            source,
            internalCallback
        );
    };

    if (includeOtherAddons)
    {
        Util.getInstalledExtensions(submitReport);
    }
    else
    {
        submitReport([]);
    }
}

exports.disableAddon = function(addonReport)
{
    try
    {
        AddonManager.getAddonByID(addonReport.guid, function(addon)
        {
            if (addon)
                addon.userDisabled = true;
        });
    }
    catch (e)
    {
        console.exception(e);
    }
}

exports.checkForLangPackDisable = function()
{
    var disableLangPacks = function()
    {
        Logger.info("Detected application upgrade (to/from alpha/beta or major upgrade); disabling langpacks.");

        var callback = function(installedExtensions)
        {
            var uninstalledC = 0;

            for (var i=0; i<installedExtensions.length; i++)
            {
                if (installedExtensions[i].type == "locale")
                {
                    Logger.info("Disabling locale '" + installedExtensions[i].id + "'");

                    installedExtensions[i].userDisabled = true;
                    //installedExtensions[i].uninstall();
                    uninstalledC++;
                }
            }

            prefService.reset("general.useragent.locale");
            prefService.reset("intl.locale.matchOS");

            if (uninstalledC > 0)
            {
                var boot = Cc["@mozilla.org/toolkit/app-startup;1"].getService(Ci.nsIAppStartup);
                boot.quit(Ci.nsIAppStartup.eForceQuit|Ci.nsIAppStartup.eRestart);
            }
        };

        Util.getInstalledExtensions(callback);
    };

    this.checkForApplicationUpgrade(disableLangPacks);
}

exports.checkForPromptTimeout = function(callback)
{
    if (!ss.storage.promptTimeout)
        return;

    if (ss.storage.promptTimeout.getTime() < (new Date()).getTime())
    {
        ss.storage.promptTimeout = null;
        callback();
    }
}

exports.doUpgradeChecks = function()
{
    exports.checkForCompatibilityReset();
    exports.checkForUpgradeToAuroraOrBeta();
    //exports.checkForLangPackDisable();

    var currAppVersion = Util.getHostEnvironmentInfo().appVersion;
    prefService.set("extensions.acr.previousApplicationVersion", currAppVersion);
}

exports.checkForCompatibilityReset = function()
{
    var resetCompatibilityInformation = function(currAppVersion)
    {
        Logger.info("Detected application upgrade (to/from alpha/beta or major upgrade); cleared previous compatibility information.");
        AddonReportStorage.clearAllAddonReports();
    };

    this.checkForApplicationUpgrade(resetCompatibilityInformation);
}

exports.checkForUpgradeToAuroraOrBeta = function()
{
    var setPromptTimeout = function(currAppVersion)
    {
        var now = new Date();
        ss.storage.promptTimeout = new Date(now.getTime() + PROMPT_TIMEOUT);

        Logger.info("Detected application upgrade (to aurora/beta); setting prompt timeout for " + ss.storage.promptTimeout.toString());

    };

    this.checkForApplicationUpgrade(setPromptTimeout, true);
}

exports.checkForApplicationUpgrade = function(callback, toAuroraOrBetaOnly)
{
    // see bug 527249 for an explanation of this method

    var versionRE = /(\d\d?\.\d)(\.\d+)?(([ab])\d.*)?/;

    var env = Util.getHostEnvironmentInfo();
    var currAppVersion = env.appVersion;
    var currAppVersionParts = currAppVersion.match(versionRE);

    if (currAppVersionParts)
    {
        Logger.debug("Current application version ('" + currAppVersion + "') is major version '"
            + currAppVersionParts[1] + "', minor version '" + currAppVersionParts[2] + "'. " 
            + (currAppVersionParts[3]?"This version is " + (currAppVersionParts[4]=="b"?"BETA":"ALPHA")
            + ", labelled '" + currAppVersionParts[3] + "'.":""));
    }
    else
    {
        Logger.error("Unrecognized current application version '" + currAppVersion  + "'.");
        return;
    }

    var prevAppVersion = prefService.get("extensions.acr.previousApplicationVersion");
    if (!prevAppVersion) 
        prevAppVersion = "";
    var prevAppVersionParts = prevAppVersion.match(versionRE);

    if (!prevAppVersionParts)
    {
        Logger.warn("Unrecognized previous application version '" + prevAppVersion  + "'.");
        if (toAuroraOrBetaOnly) {
            if (currAppVersionParts[4] == "a" || currAppVersionParts[4] == "b")
                callback(currAppVersion);
        } else {
            callback(currAppVersion);
        }
        return;
    }
    else
    {
        Logger.debug("Previous application upgrade ('" + prevAppVersion + "') was major version '"
            + prevAppVersionParts[1] + "', minor version '" + prevAppVersionParts[2] + "'. " 
            + (prevAppVersionParts[3]?"This version was " + (prevAppVersionParts[4]=="b"?"BETA":"ALPHA")
            + ", labelled '" + prevAppVersionParts[3] + "'.":""));
    }

    if (prevAppVersion == currAppVersion)
        return;

    if (toAuroraOrBetaOnly) {
        if (currAppVersionParts[1] != prevAppVersionParts[1] &&
            (currAppVersionParts[4] == "a" || currAppVersionParts[4] == "b"))
            callback(currAppVersion);
        else
            return;
    }

    // check for major version upgrade
    if (currAppVersionParts[1] != prevAppVersionParts[1])
    {
        callback(currAppVersion);
        return;
    }

    // check for upgrade from or to alpha or beta
    if (currAppVersionParts[4] == "a" || prevAppVersionParts[4] == "a" ||
        currAppVersionParts[4] == "b" || prevAppVersionParts[4] == "b")
    {
        callback(currAppVersion);
        return;
    }

}

exports.setAMOShowIncompatibleAddons = function ()
{
    Logger.info("Setting AMO show incompatible addons");

    // see bug 675762
    try
    {
        Util.getLocalStorageForOrigin(SHOW_INCOMPATIBLE_ADDONS_STORAGE_ORIGIN).setItem(SHOW_INCOMPATIBLE_ADDONS_STORAGE_NAME, 1);
    }
    catch (e)
    {
        Logger.warn("ShowIncompatibleAddons: Local storage disabled ('" + e + "') falling back to cookies.");

        var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
        var cookieUri = ios.newURI(SHOW_INCOMPATIBLE_ADDONS_STORAGE_ORIGIN, null, null);
        var cookieSvc = Cc["@mozilla.org/cookieService;1"].getService(Ci.nsICookieService);
        cookieSvc.setCookieString(cookieUri, null, SHOW_INCOMPATIBLE_ADDONS_STORAGE_NAME + "=1", null);
    }
}

exports.removeAMOShowIncompatibleAddons = function()
{
    // see bug 675762

    try
    {
        Util.getLocalStorageForOrigin(SHOW_INCOMPATIBLE_ADDONS_STORAGE_ORIGIN).removeItem(SHOW_INCOMPATIBLE_ADDONS_STORAGE_NAME);
    } 
    catch (e) {}

    var cookieMgr = Cc["@mozilla.org/cookiemanager;1"].getService(Ci.nsICookieManager);

    for (var e = cookieMgr.enumerator; e.hasMoreElements();)
    {
        var cookie = e.getNext().QueryInterface(Ci.nsICookie);

        if ("https://" + cookie.host == SHOW_INCOMPATIBLE_ADDONS_STORAGE_ORIGIN && cookie.name == SHOW_INCOMPATIBLE_ADDONS_STORAGE_NAME)
        {
            cookieMgr.remove(cookie.host, cookie.name, cookie.path, false);
        }
    }
}

function lastrun()
{
    prefService.reset("extensions.acr.amo_host");
    prefService.reset("extensions.acr.previousApplicationVersion");
    prefService.reset("extensions.acr.debug");
    prefService.reset("extensions.acr.verbose");
    prefService.reset("extensions.acr.donefirstrun");

    ss.storage.addons = null;
    ss.storage.addonReports = null;

    exports.removeAMOShowIncompatibleAddons();
    Logger.debug("removing an addon listener");
    AddonManager.removeAddonListener(addonListener);
}

var addonListener = {
    onOperationCancelled: function(addon) {},
    onUninstalled: function(addon) {
        try
        {
            Logger.debug(addon.id + " is uninstalled");
        }
        catch (e) {}
    },
    onEnabling: function(addon, needsRestart) {},
    onDisabling: function(addon, needsRestart) {
        // This appears to be fired multiple times per extension
        try
        {
            Logger.debug(addon.id + " is disabling");
        }
        catch (e) {}
    },
    onUninstalling: function(addon, needsRestart) 
    {
        // Not working ... never entered
        try
        {
            Logger.debug(addon.id + " is uninstalling");
            if (addon.id == self.id) 
            {
                Logger.debug("ACR is uninstalling");
                obsService.notify("acr_install_change");
                lastrun();
            }
        }
        catch (e) {}
    },
    onDisabled: function(addon) {},
    onInstalling: function(addon, needsRestart)
    {
        try
        {
            Logger.debug("addon '" + addon.id + "' is installing");
            var addonReport = AddonReportStorage.getAddonReportByAddon(addon);

            if (addon.isCompatible)
            {
                Logger.debug("compatible addon '" + addon.id + "' has been installed - clearing compatibility report");

                if (addonReport)
                {
                    AddonReportStorage.deleteAddonReport(addonReport);

                    addonReport = AddonReportStorage.getAddonReportByAddon(addon);
                    //notifyAddonReportUpdateListeners(addonReport);
                }
            }

            obsService.notify("acr_addonreport_updated", addonReport);
        } catch (e) { console.exception(e); }
    },
    onInstalled: function(addon)
    {
        try
        {
            Logger.debug("addon " + addon.id + " '" + addon.name + "' is installed");
            var addonReport = AddonReportStorage.getAddonReportByAddon(addon);
            obsService.notify("acr_addonreport_updated", addonReport);
        } catch (e) { console.exception(e); }    
    }
}

exports.registerAddonListener = function()
{
    Logger.debug("adding an addon listener");
    AddonManager.addAddonListener(addonListener);
}

