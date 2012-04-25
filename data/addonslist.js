self.port.on("addonReports", function(addonReports) {

    document.addonReports = addonReports;

    var table = document.getElementById("addons");
    while (table.hasChildNodes()) {
        table.removeChild(table.childNodes[0]);
    }

    for (var i=0; i<addonReports.length; i++) {
        var tr = document.createElement("tr");

        var img = document.createElement("img");
        img.setAttribute("class", "addon-image");
        img.setAttribute("src", addonReports[i].iconURL);
        var td1 = document.createElement("td");
        td1.appendChild(img);
        tr.appendChild(td1);

        var td2 = document.createElement("td");
        var h3 = document.createElement("h3");
        h3.appendChild(document.createTextNode(addonReports[i].name));
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
                invalidate();
            };
        };

        var td3 = document.createElement("td");
        var tick = document.createElement("img");
        tick.setAttribute("id", "tick-" + addonReports[i].guid);
        tick.setAttribute("title", "I have used this add-on with no issues");
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
});

var invalidate = function()
{
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
            // no issues
            document.getElementById("tick-" + document.addonReports[i].guid).src
                = "image/tick.png";
        }
    }
}
