/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cc,Ci,Cu} = require("chrome");
const prefService = require("sdk/preferences/service");
const Request = require("sdk/request").Request;
const Logger = require("acr-logger");
const Util = require("acr-util");

const SERVICE_ROOT_URL = "https://%%AMO_HOST%%/en-US/firefox";
const SERVICE_SUBMIT_REPORT = "/compatibility/incoming";

exports.submitReport = function(guid, addonVersion, worksProperly, appGUID, appVersion, appBuild, clientOS, comments, otherAddons, source, callback)
{
    Logger.debug("API.submitReport: guid = '" + guid + "', worksProperly = " + worksProperly);
    
    if (source && comments.trim() != "") {
        comments += " [Submitted via " + source + "]";
    }

    var data = JSON.stringify({
        guid: guid,
        version: addonVersion,
        worksProperly: worksProperly,
        appGUID: appGUID,
        appVersion: appVersion,
        appBuild: appBuild,
        clientOS: clientOS,
        comments: comments,
        otherAddons: otherAddons
    });

    var url = SERVICE_ROOT_URL.replace("%%AMO_HOST%%", prefService.get("extensions.acr.amo_host")) + SERVICE_SUBMIT_REPORT;

    Logger.debug("API.submitReport: posting the following to '" + url + "': " + data);

    Request(
    {
        url: url,
        content: data,
        contentType: "application/json",
        headers: {"Content-length": data.length},
        onComplete: function (response)
        {
            if (response.status >= 200 && response.status <= 300)
            {
                Logger.log("Got OK response from server: " + response.text);
                callback(true);
            }
            else
            {
                Logger.log("Got error (" + response.status + ") from server: " + response.text);
                callback(null);
            }
        }
    }).post();
}


