var ClientApp = require("../lib/app"),
    path = require("path");

// Set up the app

var exampleApp = new ClientApp({
    name: "Example",
    version: "0.1.0",
    hostname: "example.localhost",
    port: 80,
    views: path.join(__dirname, "views")
});

// Add another view

exampleApp.get("/about", function(req, res, next) {
    res.render("about", {title: "About"});
});

exampleApp.run(function(err) {
});

