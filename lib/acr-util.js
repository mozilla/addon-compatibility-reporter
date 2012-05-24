/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cc,Ci,Cu} = require("chrome");
const Logger = require("acr-logger");
const AddonManager = Cu.import("resource://gre/modules/AddonManager.jsm").AddonManager;

exports.getHostEnvironmentInfo = function()
{
    // Returns "WINNT" on Windows Vista, XP, 2000, and NT systems;
    // "Linux" on GNU/Linux; and "Darwin" on Mac OS X.
    var osName = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime).OS;

    var osVersion;
    
    try
    {
        osVersion = this.getMostRecentAppWindow().navigator.oscpu;
    }
    catch (e) { Logger.warn(e); }

    var info = Cc["@mozilla.org/xre/app-info;1"] .getService(Ci.nsIXULAppInfo);

    // Get the name of the application running us
    //info.name; // Returns "Firefox" for Firefox
    //info.version; // Returns "2.0.0.1" for Firefox version 2.0.0.1

    var hostEnvInfo =
    {
        osName: osName,
        osVersion: osVersion,
        appGUID: info.ID,
        appName: info.name,
        appVersion: info.version,
        appBuildID: info.appBuildID
    };

    return hostEnvInfo;
}

exports.getAppName = function()
{
    // Returns "Firefox", "Thunderbird" or "SeaMonkey"
    var envinfo = this.getHostEnvironmentInfo();
    return envinfo.appName;
}

exports.getFullApplicationString = function()
{
    var envinfo = this.getHostEnvironmentInfo();

    return envinfo.appName + " " + envinfo.appVersion + " (build " + envinfo.appBuildID + ")";
}

exports.getFullOSString = function()
{
    var envinfo = this.getHostEnvironmentInfo();

    return envinfo.osVersion;
}

exports.dumpObject = function(obj, name, indent, depth)
{
    Logger.debug(_dumpObject(obj, name, indent, depth));
}

var _dumpObject = function(obj, name, indent, depth)
{
    if (!name) name = "object";
    if (!indent) indent = " ";

    if (depth > 10)
    {
        return indent + name + ": <Maximum Depth Reached>\n";
    }

    if (typeof obj == "object")
    {
        var child = null;
        var output = indent + name + "\n";
        indent += "\t";

        for (var item in obj)
        {
            try
            {
                child = obj[item];
            }
            catch (e)
            {
                child = "<Unable to Evaluate>";
            }

            if (typeof child == "object")
            {
                output += _dumpObject(child, item, indent, depth + 1);
            }
            else
            {
                output += indent + item + ": " + child + "\n";
            }
        }
        return output;
    }
    else
    {
        return obj;
    }
}

exports.getInstalledExtensions = function(callback)
{
    try
    {
        AddonManager.getAllAddons(callback);
    }
    catch (e)
    {
        console.exception(e);
    }
}

exports.getLocalStorageForOrigin = function(origin)
{
    // e.g. origin = "http://example.com"

    try
    {
        var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
        var ssm = Cc["@mozilla.org/scriptsecuritymanager;1"].getService(Ci.nsIScriptSecurityManager);
        var dsm = Cc["@mozilla.org/dom/storagemanager;1"].getService(Ci.nsIDOMStorageManager);

        var uri = ios.newURI(origin, "", null);
        var principal = ssm.getCodebasePrincipal(uri);
        var storage = dsm.getLocalStorageForPrincipal(principal, "");

        //storage.setItem("chromekey", "chromevalue");

        return storage;
    }
    catch (e) { Logger.warn(e); return null; }
}

exports.getMostRecentAppWindow = function()
{
    var appWinString = "navigator:browser"; // default, Firefox
    var app = Cc["@mozilla.org/xre/app-info;1"] .getService(Ci.nsIXULAppInfo).name;
    if (app == "Thunderbird")
        appWinString = "mail:3pane";
    var appWindow = Cc["@mozilla.org/appshell/window-mediator;1"]
                .getService(Ci.nsIWindowMediator)
                .getMostRecentWindow(appWinString);
    return appWindow;
}

