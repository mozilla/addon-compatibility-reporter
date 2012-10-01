/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

self.port.on("init", function(data) {
    // console.log("Initializing submit report dialog for: " + data.guid);

    document.getElementById("addon").textContent = data.addon;
    document.getElementById("version").textContent = data.version;
    document.getElementById("details-addon-image").src = data.iconURL;
    document.getElementById("details").value = data.details;
    //document.getElementById("application").textContent = data.application;
    //document.getElementById("operatingSystem").textContent = data.operatingSystem;

    document.getElementById("details").addEventListener("blur", function() {
        self.port.emit("save_details", document.getElementById("details").value);
    }, true);

    var submit = function(comment) {
        var submitData = {
            guid: data.guid,
            details: comment,
            includeAddons: false/*document.getElementById("includeAddons").checked*/,
            disableAddon: false/*document.getElementById("disableAddon").checked*/
        };
        self.port.emit("submit_report", submitData);
        document.getElementById("skipcomment").style.display = 'none';
        document.getElementById("buttons").style.display = 'none';
        document.getElementById("spinner").style.display = 'block';
        document.getElementById("details").disabled = true;
    };

    document.getElementById("submitReportButton").addEventListener("click",
	function() { submit(document.getElementById("details").value); },
	true);

    document.getElementById("skipcommenta").addEventListener("click",
	function() { submit(""); },
	true);

    // console.log("Setting document height to : " + data.panelHeight);
    document.body.style.height = data.panelHeight + "px";

    setTimeout(function() {
        document.getElementById("details").focus();
    }, 500);
});

self.port.on("submit_report_error", function(data) {
    document.getElementById("spinner").style.display = 'none';
    document.getElementById("error").style.display = 'block';
});

self.port.on("submit_report_success", function(data) {
    document.getElementById("spinner").style.display = 'none';
    document.getElementById("success").style.display = 'block';
});

document.getElementById("closeButton").addEventListener("click", 
    function(e) { 
        self.port.emit("user_closed_panel");
    }, false);
