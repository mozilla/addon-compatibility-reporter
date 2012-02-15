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
const prefService = require("preferences-service");
const ss = require("simple-storage");

if (!prefService.isSet("extensions.acr.hasfirstrun"))
{
    // TODO first run stuff
    //prefService.set("extensions.acr.addons", "");
    //prefService.set("extensions.acr.addons_reports", "");
    prefService.set("extensions.acr.amo_host", "addons.mozilla.org");
    prefService.set("extensions.acr.previousApplicationVersion", "");
    prefService.set("extensions.acr.debug", true);
    prefService.set("extensions.acr.verbose", true);
    prefService.set("extensions.acr.hasfirstrun", true);
    //prefService.set("extensions.acr.autorestart", true);
    //prefService.set("extensions.acr.firstrun", true);
    //prefService.set("extensions.acr.postinstall", true);

    ss.storage.addons = {};
    ss.storage.addonReports = {};
}

const Logger = require("Logger");
const Util = require("Util");
const AddonReportStorage = require("AddonReportStorage");
const API = require("API");
const AddonManager = Cu.import("resource://gre/modules/AddonManager.jsm").AddonManager;

exports.Logger = Logger;
exports.Util = Util;
exports.AddonReportStorage = AddonReportStorage;

const EM_ID = "compatibility@addons.mozilla.org";
const SHOW_INCOMPATIBLE_ADDONS_STORAGE_ORIGIN = "https://addons.mozilla.org";
const SHOW_INCOMPATIBLE_ADDONS_STORAGE_NAME = "ShowIncompatibleAddons";

/*
var CHECK_COMPATIBILITY_PREFS_FB = COMPATIBILITY_PREFS_FX; // Firefox
var CHECK_COMPATIBILITY_PREFS_TB = COMPATIBILITY_PREFS_TB; // Thunderbird
var CHECK_COMPATIBILITY_PREFS_SM = COMPATIBILITY_PREFS_SM; // SeaMonkey

const FIRSTRUN_LANDING_PAGE = "https://%%AMO_HOST%%/pages/compatibility_firstrun".
    replace("%%AMO_HOST%%", prefService.get("extensions.acr.amo_host"));
const FIRSTRUN_LANDING_PAGE_TB = "https://%%AMO_HOST%%/thunderbird/pages/compatibility_firstrun".
    replace("%%AMO_HOST%%", prefService.get("extensions.acr.amo_host"));
*/

exports.flags = {initialized: false, addonListenerRegistered: false};

exports.submitReport = function(addonReport, stillWorks, details, includeOtherAddons, callback)
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

        var internalCallback = function(event)
        {
            if (!event.isError())
            {
                addonReport.state = (stillWorks ? 1 : 2);
                AddonReportStorage.saveAddonReport(addonReport, details);
            }

            callback(event);
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

exports.checkForCompatibilityReset = function()
{
    var resetCompatibilityInformation = function(currAppVersion)
    {
        Logger.info("Detected application upgrade (to/from alpha/beta or major upgrade); cleared previous compatibility information.");
        prefService.set("extensions.acr.previousApplicationVersion", currAppVersion);
        prefService.set("extensions.acr.addons", "");
        prefService.set("extensions.acr.addons_reports", "");
        //disableCheckCompatibilityPrefs();
    };

    this.checkForApplicationUpgrade(resetCompatibilityInformation);
}

exports.checkForApplicationUpgrade = function(callback)
{
    // see bug 527249 for an explanation of this method

    var versionRE = /(\d\.\d)(\.\d+)?(([ab])\d.*)?/;

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
    var prevAppVersionParts = prevAppVersion.match(versionRE);

    if (!prevAppVersionParts)
    {
        Logger.warn("Unrecognized previous application version '" + prevAppVersion  + "'.");
        callback(currAppVersion);
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

exports.setAMOShowIncompatibleAddons = function()
{
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

/* TODO -- check following functions to see if still neded
function firstrun()
{
    if (prefService.get("extensions.acr.firstrun") === true)
    {
        prefService.set("extensions.acr.firstrun", false);
    }

    setAMOShowIncompatibleAddons();
}

function lastrun()
{
    var checkCompatibilityPrefs;
    switch (Util.getAppName())
    {
        case "Thunderbird":
            checkCompatibilityPrefs = CHECK_COMPATIBILITY_PREFS_TB;
            break;
        case "SeaMonkey":
            checkCompatibilityPrefs = CHECK_COMPATIBILITY_PREFS_SM;
            break;
        default: // Firefox
            checkCompatibilityPrefs = CHECK_COMPATIBILITY_PREFS_FB;
    }

    var compatByDefault = false;
    try { // AddonManager is FF4+ only
        compatByDefault = ("strictCompatibility" in AddonManager) &&
                              !AddonManager.strictCompatibility;
    }
    catch(e) {}
    if (compatByDefault)
      Logger.debug("Compatible-by-default is enabled; compatibility checking will not be disabled");

    for (var i=0; i<checkCompatibilityPrefs.length; i++)
    {
        try
        {
            if (prefService.has(checkCompatibilityPrefs[i]+".previous"))
            {
                var previous = prefService.get(checkCompatibilityPrefs[i]+".previous", true);

                if (!compatByDefault)
                {
                    // don't turn back on check compatibility if we're in a compat by default browser
                    prefService.set(checkCompatibilityPrefs[i], previous);
                    Logger.debug("Resetting compatibility pref '" + checkCompatibilityPrefs[i] + "' to previous value '" + previous + "'.");
                }

                prefService.reset(checkCompatibilityPrefs[i]+".previous");
            }
            else
            {
                if (!compatByDefault)
                {
                    prefService.reset(checkCompatibilityPrefs[i]);
                    Logger.debug("Compatibility pref '" + checkCompatibilityPrefs[i] + "' had no previous value - have cleared this pref.");
                }
            }
        }
        catch (e)
        {
            Logger.warn("Could not reset a checkCompatibility pref: " + e);
        }
    }

    prefService.set("extensions.acr.firstrun", true);
    prefService.reset("extensions.acr.postinstall");

    removeAMOShowIncompatibleAddons();
}

function isDisabled()
{
    Logger.debug("ACR is disabled");
    
    // bug 671252
    prefService.reset("extensions.acr.postinstall");

    removeAMOShowIncompatibleAddons();
}

function isEnabled()
{
    setAMOShowIncompatibleAddons();
}

function registerAddonListener()
{
    if (flags.addonListenerRegistered) return;

    try
    {
        var listener = {
            onUninstalling: function(addon)
            {
                try
                {
                    if (addon.id == EM_ID) lastrun();
                }
                catch (e) {}
            },
            onOperationCancelled: function(addon)
            {
                try
                {
                    if (addon.id == EM_ID) firstrun();
                }
                catch (e) {}
            },
            onUninstalled: function(addon)
            {
                try
                {
                    Logger.debug("addon '" + addon.id + "' is uninstalled");
                }
                catch (e) {}
            },
            onEnabling: function(addon)
            {
                try
                {
                    Logger.debug("addon '" + addon.id + "' is enabling");

                    if (addon.id == EM_ID) isEnabled();
                }
                catch (e) {}
            },
            onDisabling: function(addon)
            {
                try
                {
                    Logger.debug("addon '" + addon.id + "' is disabling");

                    if (addon.id == EM_ID) isDisabled();
                }
                catch (e) {}
            },
            onDisabled: function(addon)
            {
                try
                {
                    Logger.debug("addon '" + addon.id + "' is disabled");
                }
                catch (e) {}
            },
            onInstalling: function(addon)
            {
                try
                {
                    Logger.debug("addon '" + addon.id + "' is installing");

                    if (addon.isCompatible)
                    {
                        Logger.debug("compatible addon '" + addon.id + "' has been installed - clearing compatibility report");

                        var addonReport = AddonReportStorage.getAddonReportByAddon(addon);

                        if (addonReport)
                        {
                            AddonReportStorage.deleteAddonReport(addonReport);

                            addonReport = AddonReportStorage.getAddonReportByAddon(addon);
                            notifyAddonReportUpdateListeners(addonReport);
                        }
                    }
                } catch (e) { Logger.error(e); dump(e+"\n"); }
            }
        }

        Logger.debug("adding an addon listener");
        AddonManager.addAddonListener(listener);
        flags.addonListenerRegistered = true;
    }
    catch (e)
    {
        _registerUninstallObserverLegacyEM();
    }
}

function _registerUninstallObserverLegacyEM()
{
    var action =
    {
        observe: function (subject, topic, data)
        {
            if ((subject instanceof Ci.nsIUpdateItem)
                &&
                (subject.id == EM_ID))
            {
                if (data == "item-uninstalled")
                    lastrun();
                else if (data == "item-cancel-action")
                    firstrun();
            }
        }
    };

    var observer = 
    {
        onAssert: function (ds, subject, predicate, target)
        {
            if ((predicate.Value == "http://www.mozilla.org/2004/em-rdf#toBeUninstalled")
                    &&
                    (target instanceof Ci.nsIRDFLiteral)
                    &&
                    (target.Value == "true")
                    &&
                    (subject.Value == "urn:mozilla:extension:" + EM_ID))
            {
                lastrun();
            }
        },
        onUnassert: function (ds, subject, predicate, target) {},
        onChange: function (ds, subject, predicate, oldtarget, newtarget) {},
        onMove: function (ds, oldsubject, newsubject, predicate, target) {},
        onBeginUpdateBatch: function() {},
        onEndUpdateBatch: function() {}
    };

    var extService = Cc["@mozilla.org/extensions/manager;1"]
        .getService(Ci.nsIExtensionManager);

    if (extService && ("uninstallItem" in extService))
    {
        var observerService = Cc["@mozilla.org/observer-service;1"]
            .getService(Ci.nsIObserverService);
        observerService.addObserver(action, "em-action-requested", false);
        flags.addonListenerRegistered = true;
    }
    else
    {
        try
        {
            extService.datasource.AddObserver(observer);
            flags.addonListenerRegistered = true;
        }
        catch (e) { }
    }
}

var addonReportUpdateListeners = [];

function addAddonReportUpdateListener(listener)
{
    addonReportUpdateListeners.push(listener);
}

function removeAddonReportUpdateListener(listener)
{
    for (var i=0; i<addonReportUpdateListeners.length; i++)
    {
        if (addonReportUpdateListeners[i] == listener)
            delete addonReportUpdateListeners[i];
    }
}

function notifyAddonReportUpdateListeners(addonReport)
{
    for (var i=0; i<addonReportUpdateListeners.length; i++)
    {
        Logger.debug("notifying an addonupdatelistener");
        addonReportUpdateListeners[i](addonReport);
    }
}
*/
