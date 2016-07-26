/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

document.addonReports = [];
document.hasAnsweredQuestions = false;
document.initialized = false;

var scrollSize = 0;

var initialize = function(data) {
    document.addonReports = data;

    if (document.initialized && data.length == $('#addons tr').length) {
        invalidate();
        return;
    }

    $('.page').hide(); $('#addonslist').show(); $('#addons').empty();

    var table = document.getElementById("addons");
    $('#spinner').hide();

    for (var i=0; i<document.addonReports.length; i++) {
        /*if (document.getElementById('addon-' + document.addonReports[i].guid))
            continue;*/

        document.addonReports[i].hasCollected = false;

        var tr = document.createElement("tr");
        //tr.setAttribute('id', 'addon-' + document.addonReports[i].guid);

        var img = document.createElement("img");
        img.setAttribute("class", "addon-image");
        img.setAttribute("src", document.addonReports[i].icon);

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

        var e10s = document.createElement("div");
        e10s.setAttribute("class", "version");
        e10s.appendChild(document.createTextNode((document.addonReports[i].multiprocessCompatible ? "Compatible" : "Not compatible") + " with multi-process."));
        td2.appendChild(e10s);
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

self.port.on("app_e10s_enabled", function(enabled) {
    $("#appE10sEnabled").text("Multi-process is " + (enabled ? "" : "not ") + "enabled.");
});

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
            document.getElementById("details-addon-image").src = document.addonReports[i].icon;
            document.getElementById("details").value = "";

            // show and resize the submit report panel
            $('.page').hide();
            $('#submitreport').show('slide',{},'slow');
            document.getElementById('submitreport').style.height = scrollSize-48 + "px";

            setTimeout(function() {
                    document.getElementById("details").focus();
                    }, 500);

            return;
        }
    }

    // all reports collected

    $('#submitspinner').show();
    $('.page').hide(); $('#submitting').show('slide', {}, 'slow');

    document.submittedReports = {};

    self.port.emit("submit_reports", document.addonReports);
}

self.port.on("set_scroller_height", function(h) {
    document.getElementById('scroller').style.height = h + "px";
    document.getElementById('scroller').style.maxHeight = h + "px";
    scrollSize = h;
});

self.port.on("submit_report_error", function() {
    $('#submitspinner').hide();
    $('#submiterror').show();
});

var hasFinishedSubmittingReports = function() {
    var finished = true;

    for (var i=0; i<document.addonReports.length; i++) {
        if (!document.submittedReports[document.addonReports[i].guid]) {
            finished = false;
        }
    }

    if (finished) {
        $('.page').hide(); $('#finished').show();
    }

    document.initialized = false;
}

self.port.on("submitted_report", function(addonReport) {

    document.submittedReports[addonReport.guid] = true;

    clearTimeout(window.hasFinishedSubmittingReportsTimeout);
    window.hasFinishedSubmittingReportsTimeout = setTimeout(hasFinishedSubmittingReports, 1000);
});

document.getElementById("collectReportsButton").addEventListener("click", collectReports, true);
document.getElementById("skipcommenta").addEventListener("click", function() { submitReport(""); }, true);
document.getElementById("submitReportButton").addEventListener("click", function() { submitReport(document.getElementById("details").value); }, true);
document.getElementById("closeButton").addEventListener("click", function() { self.port.emit("user_closed_panel", document.hasAnsweredQuestions); }, true);

