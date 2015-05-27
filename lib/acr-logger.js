/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["debug", "warn", "log", "error", "fatal", "info"];

const {Cc,Ci,Cu} = require("chrome");
const prefService = require("sdk/preferences/service");

var ENABLE_SDK_CONSOLE_LOG = true;
var ENABLE_CONSOLE_LOG = false;
var ENABLE_DUMP_LOG = true;
var ENABLE_TIMESTAMPS = true;

var consoleService = null;
var _debug = null;
var _verbose = null;

var _realLog = function(msg, level)
{
    if (ENABLE_DUMP_LOG)
        _dumpLog(msg, level);

    if (ENABLE_CONSOLE_LOG)
        _consoleLog(msg, level);

    if (ENABLE_SDK_CONSOLE_LOG)
        _sdkConsoleLog(msg, level);
};

var _dumpLog = function(msg, level)
{
    var datestr = "";

    if (ENABLE_TIMESTAMPS)
    {
        var date = new Date();
        datestr = " " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds() + "." + date.getMilliseconds();
    }

    dump("ACR (" + _getNiceLevel(level) + ")" + datestr + ": " + msg + "\n");
};

var _sdkConsoleLog = function(msg, level)
{
    var datestr = "";

    if (ENABLE_TIMESTAMPS)
    {
        var date = new Date();
        datestr = " " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds() + "." + date.getMilliseconds() + " ";
    }

    var logstr = datestr + "[ACR] " + msg;

    switch (level)
    {
        case 1:
            console.error(logstr);
            break;
        case 2:
            console.warn(logstr);
            break;
        default:
            console.log(logstr);
            break;
    }
};


var _consoleLog = function(msg, level)
{
    if (!consoleService)
    {
        consoleService = Cc['@mozilla.org/consoleservice;1'].
            getService(Ci.nsIConsoleService);
    }

    var datestr = "";

    if (ENABLE_TIMESTAMPS)
    {
        var date = new Date();
        datestr = " " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds() + "." + date.getMilliseconds();
    }

    consoleService.logStringMessage("ACR (" + _getNiceLevel(level) + ")" + datestr + ": " + msg);
};

var _isDebugEnabled = function()
{
    if (_debug == null)
    {
        var debug = prefService.get("extensions.acr.debug");

        if (debug == undefined)
            _debug = false;
        else
            _debug = debug;
    }

    return _debug;
};

var _isVerboseEnabled = function()
{
    if (_isDebugEnabled() === true)
    {
        return true;
    }

    if (_verbose == null)
    {
        var verbose = prefService.get("extensions.acr.verbose");

        if (verbose == undefined)
            _verbose = false;
        else
            _verbose = verbose;
    }

    return _verbose;
};

var _getNiceLevel = function(level)
{
    switch (level)
    {
        case 1: return "ERROR"; break;
        case 2: return "WARN"; break;
        case 5: return "DEBUG"; break;
        default: return "INFO";
    }

    return "INFO";
};

exports.debug = function(msg)
{
    //alert("Bandwagon.Logger.debug 1");
    if (!_isDebugEnabled()) return;

    //alert("Bandwagon.Logger.debug 1");
    _realLog(msg, 5);
}

exports.info = function(msg)
{
    if (!_isVerboseEnabled()) return;

    _realLog(msg, 3);
}

exports.log = function(msg)
{
    if (!_isVerboseEnabled()) return;

    _realLog(msg, 3);
}

exports.warn = function(msg)
{
    if (!_isVerboseEnabled()) return;

    _realLog(msg, 2);
}

exports.error = function(msg)
{
    _realLog(msg, 1);
}

exports.fatal = function(msg)
{
    _realLog(msg, 1);
}


