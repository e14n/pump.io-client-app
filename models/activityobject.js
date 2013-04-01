// activityobject.js
//
// represent an activity object
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

var _ = require("underscore"),
    async = require("async"),
    DatabankObject = require("databank").DatabankObject,
    ih8it = require("./ih8it");

var ActivityObject = DatabankObject.subClass("activityobject");

ActivityObject.schema = {
    pkey: "url",
    fields: ["attachments",
             "author",
             "content",
             "displayName",
             "downstreamDuplicates",
             "id",
             "image",
             "objectType",
             "published",
             "summary",
             "updated",
             "upstreamDuplicates"],
    indices: ["id"]
};

ActivityObject.ensure = function(url, callback) {
    ActivityObject.get(url, function(err, aobj) {
        if (err && err.name == "NoSuchThingError") {
            ActivityObject.discover(url, callback);
        } else if (err) {
            callback(err, null);
        } else {
            // XXX: update endpoints?
            callback(null, aobj);
        }
    });
};

ActivityObject.prototype.afterGet = function(callback) {
    var aobj = this;
    aobj.id = aobj.url;
    callback(null);
};

ActivityObject.discover = function(url, callback) {

    // XXX: do OpenGraph discovery

    async.waterfall([
        function(callback) {
            var props = {
                url: url,
                objectType: "page",
                displayName: "A Web Page"
            };
            ActivityObject.create(props, callback);
        }
    ], callback);

};

module.exports = ActivityObject;

