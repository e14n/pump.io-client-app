// ih8it.js
//
// data object representing the app itself
//
// Copyright 2013, E14N https://e14n.com/
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

var ih8it = {

    name: null,

    hostname: null,

    version: "0.1.0-alpha1",

    description: null,

    protocol: "http",

    url: function(rel) {
        var app = this;
        return app.protocol + "://" + app.hostname + rel;
    },

    asService: function() {

        var app = this;

        return {
            objectType: "service", // XXX: "app"?
            displayName: app.name,
            id: app.url("/"),
            url: app.url("/"),
            description: app.description
        };
    },

    userAgent: function() {
        var app = this;
        return app.hostname.replace(/[\(\)<>@,;:\"\\\/\[\]\?\=\{\}\s]/g, "") + "/" + app.version + " (" + app.url("/") + "; " + app.description + ")";
    }
};

module.exports = ih8it;
