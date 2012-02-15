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
const Logger = require("Logger");
const Util = require("Util");

const ACR_RPC_SERVICE_ROOT_URL = "https://%%AMO_HOST%%/en-US/firefox";
const ACR_RPC_SUBMIT_REPORT = "/compatibility/incoming";
    
const ACR_API_ENABLE_CACHE_BUSTER = 1;

exports.ACR_RPC_EVENT_TYPE_SUBMIT_REPORT_COMPLETE  = 100;

// xhr layer constants

const ACR_API_NET_FAILURE = -1;
const ACR_API_NET_SUCCESS = 1;
const ACR_API_NET_CREATED = 10;
const ACR_API_NET_INPROGRESS = 20;
const ACR_API_NET_FINISHED = 30;

const ACR_API_NET_ERROR_HTTP = 400;
const ACR_API_NET_ERROR_XHR_CONNECTION = 500;
const ACR_API_NET_ERROR_XHR_CREATE = 510;
const ACR_API_NET_ERROR_XML_PROTOCOL = 520;

const ACR_API_SERVICE_ERROR_BAD_JSON = 1010;               // http status 200 - 300, but unparsable JSON response
const ACR_API_SERVICE_ERROR_UNEXPECTED_JSON = 1011;        // http status 200 - 300, but unexpected JSON response
const ACR_API_SERVICE_ERROR = 1050;                       // http status 200 - 300, but "expected" error in JSON response

const ACR_API_SERVICE_ERROR_BAD_REQUEST = 1400;           //400 BAD REQUEST = Invalid request URI or header, or unsupported nonstandard parameter.
const ACR_API_SERVICE_ERROR_UNAUTHORIZED = 1401;          //401 UNAUTHORIZED = Authorization required.
const ACR_API_SERVICE_ERROR_FORBIDDEN = 1403;             //403 FORBIDDEN = Unsupported standard parameter, or authentication or authorization failed.
const ACR_API_SERVICE_ERROR_NOT_FOUND = 1404;             //404 NOT FOUND = Resource (such as a collection or entry) not found.
const ACR_API_SERVICE_ERROR_CONFLICT = 1409;              //409 CONFLICT = Specified version number doesn't match resource's latest version number.
const ACR_API_SERVICE_ERROR_BAD_CONTEXT = 1422;           //422 BAD CONTENT = The data within this entry's <content> is not valid. For example, this may indicate not "well-formed" XML
const ACR_API_SERVICE_ERROR_INTERNAL_SERVER_ERROR = 1500; //500 INTERNAL SERVER ERROR = Internal error. This is the default code that is used for all unrecognized errors.
const ACR_API_SERVICE_ERROR_CRITICAL_ERROR = 1600;        // http status other

var observers = [];

exports.registerObserver = function(observer)
{
    observers.push(observer);
}

exports.unregisterObserver = function(observer)
{
    for (var i=0; i<observers.length; i++)
    {
        if (observers[i] == observer)
            delete observers[i];
    }
}

exports.submitReport = function(guid, addonVersion, worksProperly, appGUID, appVersion, appBuild, clientOS, comments, otherAddons, callback)
{
    Logger.debug("API.submitReport: guid = '" + guid + "', worksProperly = " + worksProperly);

    var data = {
        guid: guid,
        version: addonVersion,
        worksProperly: worksProperly,
        appGUID: appGUID,
        appVersion: appVersion,
        appBuild: appBuild,
        clientOS: clientOS,
        comments: comments,
        otherAddons: otherAddons
    };

    var internalCallback = function(event)
    {
        // don't need to do anything here
        if (callback)
            callback(event);
    };

    _rpcSend(
            internalCallback, 
            this.ACR_RPC_EVENT_TYPE_SUBMIT_REPORT_COMPLETE, 
            "POST",
            data,
            _serviceRootURL+ACR_RPC_SUBMIT_REPORT);
}


// private

Event = function(type, result, response)
{
    this._type = type;
    this._result = result;
    this._response = response;
    this.isInternalEvent = false;
    this.error = null;
};

Event.prototype.isError = function()
{
    return this._result != ACR_API_NET_SUCCESS;
};

Event.prototype.setError = function(error)
{
    this.error = error;
    this._result = error.code;
};

Event.prototype.getError = function()
{
    if (this._result == ACR_API_NET_SUCCESS) return null;
	
    if (this.error === null)
    {
        this.error = new Error();
        this.error.code = -1;
        this.error.message = "Internal error";
    }

	return this.error;
};

Event.prototype.getType = function()
{
	return this._type;
};

Event.prototype.getData = function()
{
	return this._response;
};

Event.prototype.toString = function()
{
	return "Event (" + (this.isError() ? this.getError().toString() : "Success") + ")";
};

Error = function(message, code)
{
    this.code = (code !== null?code:0);
    this.message = message;
    this.url = null;
};

Error.prototype.getCode = function()
{
    return this.code;
};

Error.prototype.getMessage = function()
{
    if (this.message === null || this.message === "")
    {
        return "(error " + this.code + ")";
    }
    else
    {
        return this.message;
    }
};

Error.prototype.toString = function()
{
    return "Error " + this.getCode() + ": " + this.getMessage();
};

var _serviceRootURL = ACR_RPC_SERVICE_ROOT_URL.replace("%%AMO_HOST%%", prefService.get("extensions.acr.amo_host"));

var _rpcFailed = function(callback, type, errorCode, lastErr, response)
{
    Logger.debug("in _rpcFailed, response = " + lastErr);

    var event = new Event(type, errorCode, response);
    event.error = new Error(lastErr, errorCode);
    event._response = response;

    if (callback)
        callback(event);

    if (!event.isInternalEvent)
        _notifyObservers(event);
};

var _rpcComplete = function(callback, type, code, response, request)
{
    Logger.debug("in _rpcComplete, response = " + response);

    var event = new Event(type, code, response);
    event.error = new Error(response, code);
    event._response = response;

    if (callback)
        callback(event);

    if (!event.isInternalEvent)
        _notifyObservers(event);
};

var _rpcSend = function(callback, type, method, data, url, credentials)
{
    if (!url) url = _serviceRootURL;

    var req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);

    if (!req) { _rpcFailed(callback, type, ACR_API_NET_ERROR_XHR_CREATE); }

    req.mozBackgroundRequest = true;

    var postData = '';

    if (('POST' == method || 'PUT' == method) && data)
    {
        postData = JSON.stringify(data);
    }
    else
    {
        if (ACR_API_ENABLE_CACHE_BUSTER)
        {
            if (data === null)
                data = [];

            data["__"] = (new Date()).getTime();
        }

        var queryString = '';

        for (i in data)
        {
            queryString += encodeURIComponent(i) + '=' + encodeURIComponent(data[i]) + '&';
        }

        if ('&' == queryString.charAt(queryString.length-1))
        {
            queryString = queryString.substring(0, queryString.length-1);
        }

        url += "?" + queryString;
    }

    Logger.debug('[API] send: opening ' + method + ' XMLHttpRequest to ' + url);

    try
    {
        req.open(method, url, true);
    }
    catch (e)
    {
        Logger.error('[API] send: error opening connection: ' + e);
        _rpcFailed(callback, type, ACR_API_NET_ERROR_XHR_CREATE);
        return;
    }

    if ('POST' == method)
    {
        req.setRequestHeader('Content-type', 'application/json');
    }

    if (('POST' == method || 'PUT' == method) && postData.length > 0)
    {
        req.setRequestHeader('Content-length', postData.length);
    }

    if (credentials)
    {
        Logger.debug('[API] send: using credentials for ' + credentials.login);
        req.setRequestHeader('Authorization', 'Basic ' + btoa(credentials.login + ':' + credentials.password));
    }

    req.setRequestHeader("If-Modified-Since", "Sat, 1 Jan 2005 00:00:00 GMT");

    // Cache-Control: no-cache ?
    //req.overrideMimeType('text/xml');

    req.onreadystatechange = function() { _rpcReady(req); };

    Logger.debug('[API] send: sending XMLHttpRequest ' + (postData.length>0?' with data "' + postData + '"':''));

    req.callback = callback;
    req.type = type;
    req.method = method;

    req.sendAsBinary(postData);
};

var _rpcReady = function(req)
{
    try
    {
        if (req.readyState != 4) { return; }
    }
    catch (e) 
    {
        Logger.error('[API] onreadystatechange: error in readyState: ' + e);
        _rpcFailed(req.callback, req.type, ACR_API_NET_ERROR_XHR_CONNECTION);
        return;
    }

    var result = ACR_API_NET_SUCCESS;
    var status = 0;
    var response = null;
    var lastErr = null;

    try 
    {
        status = req.status;
    }
    catch (e)
    {
        Logger.error('[API] send: no http status... a protocol error occured');
        _rpcFailed(req.callback, req.type, ACR_API_NET_ERROR_HTTP);
        return;
    }

    try
    {
        if (req.responseText !== "")
            response = JSON.parse(req.responseText);
        else
            response = ""; // empty response + 204 = :)
    }
    catch (e)
    {
        Logger.error("[API] send: can't evaluate JSON response... '" + e + "'");
        lastErr = e;
    }

    Logger.debug('[API] send: completed, status = ' + status);
    Logger.debug("[API] send: completed, response text = '" + req.responseText + "'");
 
    if (
        (req.method === 'DELETE' && (status == 303)) ||
        (req.method === 'DELETE' && (status == 410)) ||
        (status >= 200 && status <= 300))
    {
        if (response !== null)
        {
            // everything went successfully
            _rpcComplete(req.callback, req.type, ACR_API_NET_SUCCESS, response, req);
            return;
        }
        else
        {
            // application error (bad json)
            _rpcFailed(req.callback, req.type, ACR_API_SERVICE_ERROR_BAD_JSON, lastErr, response);
            return;
        }
    }

    // try to get an error message in response error -> lastErr

    try 
    {
        lastErr = response.error + ": " + response.details;
        Logger.debug("[API] send: completed, response error message = '" + lastErr + "'");
    }
    catch (e)
    {
        Logger.debug("[API] send: have an error status code (" + status + "), but there is no error message in the JSON response");
        lastErr = null;
    }

    if (status == 400)
    {
        _rpcFailed(req.callback, req.type, ACR_API_SERVICE_ERROR_BAD_REQUEST, lastErr, response);
        return;
    }
    else if (status == 401)
    {
        _rpcFailed(req.callback, req.type, ACR_API_SERVICE_ERROR_UNAUTHORIZED, lastErr, response);
        return;
    }
    else if (status == 403)
    {
        _rpcFailed(req.callback, req.type, ACR_API_SERVICE_ERROR_FORBIDDEN, lastErr, response);
        return;
    }
     else if (status == 404)
    {
        _rpcFailed(req.callback, req.type, ACR_API_SERVICE_ERROR_NOT_FOUND, lastErr, response);
        return;
    }
     else if (status == 409)
    {
        _rpcFailed(req.callback, req.type, ACR_API_SERVICE_ERROR_CONFLICT, lastErr, response);
        return;
    }
    else if (status == 422)
    {
        _rpcFailed(req.callback, req.type, ACR_API_SERVICE_ERROR_BAD_CONTEXT, lastErr, response);
        return;
    }
     else if (status == 500)
    {
        _rpcFailed(req.callback, req.type, ACR_API_SERVICE_ERROR_INTERNAL_SERVER_ERROR, lastErr, response);
        return;
    }
    else
    {
        _rpcFailed(req.callback, req.type, ACR_API_SERVICE_ERROR_CRITICAL_ERROR, lastErr, response);
        return;
    }
};

var _notifyObservers = function(event)
{
    for (var i=0; i<observers.length; i++)
    {
        try
        {
            Logger.debug("[API]: will notify an observer");

            observers[i](event);
        }
        catch (e)
        {
            Logger.error("[API]: error notifying observer: " + e);
        }
    }
};


