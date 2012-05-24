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

document.addonReports = [];
document.hasAnsweredQuestions = false;
document.initialized = false;

var initialize = function(data) {

    if (document.initialized && data.length == $('#addons tr').length)
        return;

    document.addonReports = data;

    $('.page').hide(); $('#addonslist').show(); $('#addons').empty();

    var table = document.getElementById("addons");
    $('#spinner').hide();

    for (var i=0; i<document.addonReports.length; i++) {
        /*if (document.getElementById('addon-' + document.addonReports[i].guid))
            continue;*/

        var tr = document.createElement("tr");
        //tr.setAttribute('id', 'addon-' + document.addonReports[i].guid);

        var img = document.createElement("img");
        img.setAttribute("class", "addon-image");
        img.setAttribute("src", document.addonReports[i].iconURL);

        var td1 = document.createElement("td");
        td1.setAttribute("class", "image-cell");
        td1.appendChild(img);
        tr.appendChild(td1);

        var td2 = document.createElement("td");
        var h3 = document.createElement("h3");
        h3.appendChild(document.createTextNode(document.addonReports[i].name));
        if (document.addonReports[i].isDisabled)
            h3.appendChild(document.createTextNode(" (disabled)"));
        td2.appendChild(h3);
        var version = document.createElement("span");
        version.setAttribute("class", "version");
        version.appendChild(document.createTextNode("Version "));
        version.appendChild(document.createTextNode(document.addonReports[i].version));
        td2.appendChild(version);
        tr.appendChild(td2);

        var makeRadioClickFunction = function(state) {
            let ix = i;
            return function() {
                document.addonReports[ix].state = state;
                document.hasAnsweredQuestions = true;
                self.port.emit("save_report", document.addonReports[ix]);
                invalidate();
            };
        };

        var td3 = document.createElement("td");
        var tick = document.createElement("div");
        tick.setAttribute("id", "tick-" + document.addonReports[i].guid);
        tick.setAttribute("title", "I have used this add-on with no issues"); // TODO title doesn't seem to work in panels????
        tick.addEventListener("click", makeRadioClickFunction(1), true);
        td3.appendChild(tick);
        tr.appendChild(td3);

        var td4 = document.createElement("td");
        var cross = document.createElement("div");
        cross.setAttribute("id", "cross-" + document.addonReports[i].guid);
        cross.setAttribute("title", "I have noticed issues due to this add-on");
        cross.addEventListener("click", makeRadioClickFunction(2), true);
        td4.appendChild(cross);
        tr.appendChild(td4);

        var td5 = document.createElement("td");
        var questionmark = document.createElement("div");
        questionmark.setAttribute("id", "questionmark-" + document.addonReports[i].guid);
        questionmark.setAttribute("title", "I haven’t used this add-on so I’m not sure");
        questionmark.addEventListener("click", makeRadioClickFunction(3), true);
        td5.appendChild(questionmark);
        tr.appendChild(td5);
        
        table.appendChild(tr);
    }

    invalidate();
    document.initialized = true;
};

self.port.on("have_addon_reports", initialize);
self.port.on("reset", function() {
    document.initialized = false;
    initialize(document.addonReports);
});

var invalidate = function() {
    for (var i=0; i<document.addonReports.length; i++) {
        document.getElementById("tick-" + document.addonReports[i].guid).className = "tick-off";
        document.getElementById("cross-" + document.addonReports[i].guid).className = "cross-off";
        document.getElementById("questionmark-" + document.addonReports[i].guid).className = "questionmark-off";

        if (document.addonReports[i].state == 2) {
            // has issues
            document.getElementById("cross-" + document.addonReports[i].guid).className = "cross-on";
        } else if (document.addonReports[i].state == 3) {
            // not sure
            document.getElementById("questionmark-" + document.addonReports[i].guid).className = "questionmark-on";
        } else {
            // no issues or nothing selected yet
            document.getElementById("tick-" + document.addonReports[i].guid).className = "tick-on";
        }
    }
}

var submitReport = function(report) {
    var guid = document.getElementById("guid").value;

    for (var i=0; i<document.addonReports.length; i++) {
        if (document.addonReports[i].guid == guid) {
            document.addonReports[i].report = report;
            document.addonReports[i].hasCollected = true;
        }
    }

    collectReports();
}

var collectReports = function() {
    document.hasAnsweredQuestions = true;
    for (var i=0; i<document.addonReports.length; i++) {
        //console.log("addon " + document.addonReports[i].name + " has state = " + document.addonReports[i].state);

        if (document.addonReports[i].state == 2 && !document.addonReports[i].hasCollected) {
            // populate submit report panel
            document.getElementById("guid").value = document.addonReports[i].guid;
            document.getElementById("addon").textContent = document.addonReports[i].name;
            document.getElementById("version").textContent = document.addonReports[i].version;
            document.getElementById("details-addon-image").src = document.addonReports[i].iconURL;
            document.getElementById("details").value = "";

            // show submit report panel
            $('.page').hide(); $('#submitreport').show('slide',{},'slow');

            setTimeout(function() {
                    document.getElementById("details").focus();
                    }, 500);

            return;
        }
    }

    // all reports collected

    $('#submitspinner').show();
    $('.page').hide(); $('#submitting').show('slide', {}, 'slow');

    self.port.emit("submit_reports", document.addonReports);
}

self.port.on("set_scroller_height", function(h) {
    document.getElementById('scroller').style.height = h + "px";
    document.getElementById('scroller').style.maxHeight = h + "px";
});

self.port.on("submit_report_error", function() {
    $('#submitspinner').hide();
    $('#submiterror').show();
});

self.port.on("submitted_report", function(addonReport) {

    var finished = true;

    for (var i=0; i<document.addonReports.length; i++) {
        if (addonReport.guid == document.addonReports[i].guid) {
            document.addonReports[i].hasSubmitted = true;
        }

        if (!document.addonReports[i].hasSubmitted) {
            finished = false;
        }
    }

    if (finished) {
        $('.page').hide(); $('#finished').show();
    }
});

document.getElementById("collectReportsButton").addEventListener("click", collectReports, true);
document.getElementById("skipcommenta").addEventListener("click", function() { submitReport(""); }, true);
document.getElementById("submitReportButton").addEventListener("click", function() { submitReport(document.getElementById("details").value); }, true);
document.getElementById("closeButton").addEventListener("click", function() { self.port.emit("user_closed_panel", document.hasAnsweredQuestions); }, true);

