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

self.port.on("init", function(data) {
    console.log("Initializing submit report dialog for: " + data.guid);

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
    };

    document.getElementById("submitReportButton").addEventListener("click",
	function() { submit(document.getElementById("details").value); },
	true);

    document.getElementById("skipcommenta").addEventListener("click",
	function() { submit(""); },
	true);

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
