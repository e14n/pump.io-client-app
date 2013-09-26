// utmlish.js
//
// An Express 3.x rendering engine that works like UTML for Express 2.x
//
// Copyright 2013, E14N (https://e14n.com/)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var fs = require("fs"),
    async = require("async"),
    path = require("path"),
    http = require("http"),
    https = require("https"),
    _ = require("underscore"),
    express = require('express'),
    consolidate = require('consolidate');

var pcache = {};

var resolveByDirs = function(filename, viewDirs, callback) {
    async.detectSeries(_.map(viewDirs, function(dir) { return path.join(dir, filename); }),
                       fs.exists,
                       function(existent) {
                           if (existent) {
                               callback(null, existent);
                           } else {
                               callback(new Error("No such view " + filename), null);
                           }
                       });
};

// We use the consolidate.underscore engine, which is pretty good, but
// lacks two important features of UTML:
//
// * Support for partial() function to render a partial
// * Support for a layout view

var utmlish = function(template, options, callback) {
    var cu = consolidate.underscore,
        viewDirs = [path.dirname(template)].concat(utmlish.viewDirs),
        resolveSync = function(filename) {
            var i, full;
            for (i = 0; i < viewDirs.length; i++) {
                full = path.join(viewDirs[i], filename);
                if (fs.existsSync(full)) {
                    return full;
                }
            }
            return null;
        },
        resolve = function(filename, callback) {
            resolveByDirs(filename, viewDirs, callback);
        },
        partial = function(name, locals) {
            var scope;
            if (!pcache[name]) {
                // XXX: sync I/O calls are for suckers
                pcache[name] = _.template(fs.readFileSync(resolveSync(name + ".utml"), {encoding: 'utf8'}));
            }
            scope = _.extend({}, globals, locals);
            return pcache[name](scope);
        },
        globals = _.extend({partial: partial}, options),
        layout;

    async.waterfall([
        function(callback) {
            resolve("layout.utml", callback);
        },
        function(filename, callback) {
            layout = filename;
            cu(template, globals, callback);
        },
        function(body, callback) {
            cu(layout,
               _.extend({body: body}, globals),
               callback);
        }
    ], callback);
};

utmlish.viewDirs = [];

utmlish.resolve = function(viewname, callback) {
    resolveByDirs(viewname + ".utml", utmlish.viewDirs, callback);
};

module.exports = utmlish;
