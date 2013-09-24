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

module.exports = function(template, options, callback) {
    var cu = consolidate.underscore,
        viewDir = path.dirname(template),
        partial = function(name, locals) {
            var scope;
            if (!pcache[name]) {
                pcache[name] = _.template(fs.readFileSync(path.join(viewDir, name + ".utml"), {encoding: 'utf8'}));
            }
            scope = _.extend({}, globals, locals);
            return pcache[name](scope);
        },
        globals = _.extend({partial: partial}, options);

    async.waterfall([
        function(callback) {
            cu(template, globals, callback);
        },
        function(body, callback) {
            cu(path.join(viewDir, "layout.utml"), 
               _.extend({body: body}, globals),
               callback);
        }
    ], callback);
};
