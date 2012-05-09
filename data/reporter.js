document.addonReports = [];
document.hasAnsweredQuestions = false;
document.initialized = false;

self.port.on("have_addon_reports", function(addonReports) {

    if (document.initialized)
        return;

    document.addonReports = addonReports;

    $('.page').hide(); $('#addonslist').show();

    var table = document.getElementById("addons");
    $('#spinner').hide();

    var h = addonReports.length*55;
    if (h> 220)
        h=220;

    self.port.emit('resize_panel', h);

    document.getElementById('scroller').style.height = h + "px";
    document.getElementById('scroller').style.maxHeight = h + "px";

    for (var i=0; i<addonReports.length; i++) {
        /*if (document.getElementById('addon-' + addonReports[i].guid))
            continue;*/

        var tr = document.createElement("tr");
        //tr.setAttribute('id', 'addon-' + addonReports[i].guid);

        var img = document.createElement("img");
        img.setAttribute("class", "addon-image");
        img.setAttribute("src", addonReports[i].iconURL);

        var td1 = document.createElement("td");
        td1.setAttribute("class", "image-cell");
        td1.appendChild(img);
        tr.appendChild(td1);

        var td2 = document.createElement("td");
        var h3 = document.createElement("h3");
        h3.appendChild(document.createTextNode(addonReports[i].name));
        if (addonReports[i].isDisabled)
            h3.appendChild(document.createTextNode(" (disabled)"));
        td2.appendChild(h3);
        var version = document.createElement("span");
        version.setAttribute("class", "version");
        version.appendChild(document.createTextNode("Version "));
        version.appendChild(document.createTextNode(addonReports[i].version));
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
        var tick = document.createElement("img");
        tick.setAttribute("id", "tick-" + addonReports[i].guid);
        tick.setAttribute("title", "I have used this add-on with no issues"); // TODO title doesn't seem to work in panels????
        tick.addEventListener("click", makeRadioClickFunction(1), true);
        td3.appendChild(tick);
        tr.appendChild(td3);

        var td4 = document.createElement("td");
        var cross = document.createElement("img");
        cross.setAttribute("id", "cross-" + addonReports[i].guid);
        cross.setAttribute("title", "I have noticed issues due to this add-on");
        cross.addEventListener("click", makeRadioClickFunction(2), true);
        td4.appendChild(cross);
        tr.appendChild(td4);

        var td3 = document.createElement("td");
        var questionmark = document.createElement("img");
        questionmark.setAttribute("id", "questionmark-" + addonReports[i].guid);
        questionmark.setAttribute("title", "I haven’t used this add-on so I’m not sure");
        questionmark.addEventListener("click", makeRadioClickFunction(3), true);
        td4.appendChild(questionmark);
        tr.appendChild(td4);
        
        table.appendChild(tr);
    }

    invalidate();
    document.initialized = true;
});

var invalidate = function() {
    for (var i=0; i<document.addonReports.length; i++) {
        document.getElementById("tick-" + document.addonReports[i].guid).src = "image/tick_off.png";
        document.getElementById("cross-" + document.addonReports[i].guid).src = "image/cross_off.png";
        document.getElementById("questionmark-" + document.addonReports[i].guid).src = "image/questionmark_off.png";

        if (document.addonReports[i].state == 2) {
            // has issues
            document.getElementById("cross-" + document.addonReports[i].guid).src
                = "image/cross.png";
        } else if (document.addonReports[i].state == 3) {
            // not sure
            document.getElementById("questionmark-" + document.addonReports[i].guid).src
                = "image/questionmark.png";
        } else {
            // no issues or nothing selected yet
            document.getElementById("tick-" + document.addonReports[i].guid).src
                = "image/tick.png";
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

