// user.js
//
// data object representing an user
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
    uuid = require("node-uuid"),
    DatabankObject = require("databank").DatabankObject,
    site = require("./site"),
    Host = require("./host");

var User = DatabankObject.subClass("user");

User.schema = {
    pkey: "id",
    fields: ["name",
             "token",
             "secret",
             "inbox",
             "outbox",
             "followers",
             "created",
             "updated"]
};

User.fromPerson = function(person, token, secret, callback) {

    var id = person.id,
        user,
        bank = User.bank();

    if (id.substr(0, 5) == "acct:") {
        id = id.substr(5);
    }

    if (!person.links ||
        !person.links["activity-inbox"] ||
        !person.links["activity-inbox"].href) {
        callback(new Error("No activity inbox."));
        return;
    }

    if (!person.links ||
        !person.links["activity-outbox"] ||
        !person.links["activity-outbox"].href) {
        callback(new Error("No activity inbox."));
        return;
    }

    if (!person.followers ||
        !person.followers.url) {
        callback(new Error("No followers."));
        return;
    }

    async.waterfall([
        function(callback) {
            User.create({id: id,
                         name: person.displayName,
                         homepage: person.url,
                         token: token,
                         secret: secret,
                         created: Date.now(),
                         updated: Date.now(),
                         inbox: person.links["activity-inbox"].href,
                         outbox: person.links["activity-outbox"].href,
                         followers: person.followers.url},
                        callback);
        }
    ], callback);
};

User.getHostname = function(id) {
    var parts = id.split("@"),
        hostname = parts[1].toLowerCase();

    return hostname;
};

User.prototype.getHost = function(callback) {

    var user = this,
        hostname = User.getHostname(user.id);

    Host.get(hostname, callback);
};

User.prototype.postActivity = function(act, callback) {

    var user = this;

    async.waterfall([
        function(callback) {
            user.getHost(callback);
        },
        function(host, callback) {
            var oa = host.getOAuth(),
                json = JSON.stringify(act);

            oa.post(user.outbox, user.token, user.secret, json, "application/json", callback);
        },
        function(data, response, callback) {
            var posted;
            if (response.statusCode >= 400 && response.statusCode < 600) {
                callback(new Error("Error " + response.StatusCode + ": " + data));
            } else if (!response.headers || 
                       !response.headers["content-type"] || 
                       response.headers["content-type"].substr(0, "application/json".length) != "application/json") {
                callback(new Error("Not application/json"));
            } else {
                try {
                    posted = JSON.parse(data);
                    callback(null, posted);
                } catch (e) {
                    callback(e, null);
                }
            }
        }
    ], function(err, posted) {
        if (err) {
            if (err instanceof Error) {
                callback(err, null);
            } else {
                callback(new Error("Error " + err.statusCode + ": " + err.data), null);
            }
        } else {
            callback(null, posted);
        }
    });
};

var verbs = ["accept",
             "access",
             "acknowledge",
             "add",
             "agree",
             "append",
             "approve",
             "archive",
             "assign",
             "at",
             "attach",
             "attend",
             "author",
             "authorize",
             "borrow",
             "build",
             "cancel",
             "close",
             "complete",
             "confirm",
             "consume",
             "checkin",
             "close",
             "create",
             "delete",
             "deliver",
             "deny",
             "disagree",
             "dislike",
             "experience",
             "favorite",
             "find",
             "follow",
             "give",
             "host",
             "ignore",
             "insert",
             "install",
             "interact",
             "invite",
             "join",
             "leave",
             "like",
             "listen",
             "lose",
             "make-friend",
             "open",
             "play",
             "post",
             "present",
             "purchase",
             "qualify",
             "read",
             "receive",
             "reject",
             "remove",
             "remove-friend",
             "replace",
             "request",
             "request-friend",
             "resolve",
             "return",
             "retract",
             "rsvp-maybe",
             "rsvp-no",
             "rsvp-yes",
             "satisfy",
             "save",
             "schedule",
             "search",
             "sell",
             "send",
             "share",
             "sponsor",
             "start",
             "stop-following",
             "submit",
             "tag",
             "terminate",
             "tie",
             "unfavorite",
             "unlike",
             "unsatisfy",
             "unsave",
             "unshare",
             "update",
             "use",
             "watch",
             "win"];

var toMethodName = function(verb) {
    var parts = verb.split("-");
    return parts[0] + parts.slice(1).map(function(str) { return str.charAt(0).toUpperCase() + str.slice(1); }).join();
};

_.each(verbs, function(verb) {
    var methodName = toMethodName(verb);
    User.prototype[methodName] = function(object, target, callback) {
        var user = this,
            act;
        if (!_.isFunction(callback)) {
            callback = target;
            target = null;
        }
        act = {
            verb: verb,
            object: object
        };
        if (target) {
            act.target = target;
        }
        user.postActivity(act, callback);
    };
});

module.exports = User;
