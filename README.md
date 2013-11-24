# pump.io-client-app

An app framework (kind of) for pump.io Web client apps.

## License

Copyright 2011-2013, E14N https://e14n.com/

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

## Description

I wrote a whole bunch of node.js-based apps that use pump.io pretty
closely, and I found myself using `git fork` to create new apps. It's
a pretty fragile mechanism and it kept me from updating older stuff.

So I've extracted as much common stuff as I can into this package, and
I'm going to change the apps to use it as a library. I think that
should let me update things more quickly.

## API

You can include the library like so:

  var PumpIOClientApp = require("pump.io-client-app");

You can create an app like this:

  var myApp = new PumpIOClientApp({
     option1: "whatever",
     option2: "another"
  });

The options are shown below. You can add routes like any other `express` app.

  myApp.get("/rutabaga", function(req, res, next) {
      res.render("rutabaga");
  });

To run the app, call run.

  myApp.run(function(err) {
    // It's running now!
  });

## Config

These are the config options you can pass to the constructor.

* `port` The port you want to listen on. Defaults to 4000, which is terrible.
* `hostname` The hostname to use for URLs. Defaults to "localhost".
* `driver` The databank driver to use. Defaults to "memory", which is a bad one!
* `params` The databank params to use. Defaults to null.
* `name` Name of the site. Default is "An unconfigured pump.io client".
* `description` Description of the site. "A pump.io client that is not correctly configured.".
* `logfile` Logfile to write to. null is the default and means write to stderr.
* `loglevel` The minimum level to use for logging. Defaults to 'info'. Change to 'debug' for development.
* `nologger` Set this to true to turn off logging. Defaults to false.
* `key` Filename of the SSL key you want the server to use. Defaults to null, meaning no SSL.
* `cert` Filename of the SSL cert to use. Defaults to null.
* `sessionSecret` A secret value to use for signing sessions. Defaults to "insecure",
   which is what it sounds like.
* `static` If you want to serve some static files, define a path for them here. Defaults to null.
* `views` If you want to add your own views (and you do), name the dir here. Defaults to null.
* `address` The address to listen on. If false-ish, will fall back to `hostname`. Default null.
* `useCDN` Whether to use CDNJS and the Google CDN for JavaScript. Defaults to true.
* `scripts` An array of strings that are paths of scripts you'd like to load. They'll be
  added to the default layout in order, after jQuery and Bootstrap. Default is `[]`.
* `styles` An array of strings that are paths of stylesheets you'd like to load. They'll be
  added to the default layout in order, at the end of the <head> section. Default is `[]`.

## Examples

There are a couple of examples in example/.

## Included software

This package includes [Twitter Bootstrap
3.0](http://getbootstrap.com/), available under the Apache 2.0
license.

This package includes [jQuery](http://jquery.com/), available under
the [MIT license](https://jquery.org/license/).

By default these are pulled from CDNs, but they're included here in
case you are debugging locally and don't want to hit the CDN.
