self.port.on("init", function(data) {
    console.log("Initializing submit report dialog for: " + data.guid);

    document.getElementById("addon").textContent = data.addon;
    document.getElementById("application").textContent = data.application;
    document.getElementById("operatingSystem").textContent = data.operatingSystem;

    document.getElementById("submitReport").addEventListener("click", function()
    {
        var submitData = 
        {
            guid: data.guid,
            details: document.getElementById("details").textContent,
            includeAddons: document.getElementById("includeAddons").checked,
            disableAddon: document.getElementById("disableAddon").checked
        };
        self.port.emit("submit_report", submitData);
        document.getElementById("buttons").style.display = 'none';
        document.getElementById("spinner").style.display = 'block';
    }, true);

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

