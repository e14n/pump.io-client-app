// rememberme.js
//
// data object representing a rememberme
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
    uuid = require("node-uuid"),
    DatabankObject = require("databank").DatabankObject;

var RememberMe = DatabankObject.subClass("rememberme");

RememberMe.schema = {
    pkey: "uuid",
    fields: ["user",
             "created"]
};

RememberMe.beforeCreate = function(props, callback) {
    if (!props.user) {
        callback(new Error("No user ID for rememberme"), null);
        return;
    }
    props.created = Date.now();
    props.uuid = uuid.v4();
    callback(null, props);
};

module.exports = RememberMe;
