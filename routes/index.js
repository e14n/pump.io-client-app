// index.js
//
// Most of the routes in the application
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

var wf = require("webfinger"),
    async = require("async"),
    _ = require("underscore"),
    uuid = require("node-uuid"),
    User = require("../models/user"),
    Host = require("../models/host"),
    RequestToken = require("../models/requesttoken"),
    ActivityObject = require("../models/activityobject"),
    ih8it = require("../models/ih8it");

exports.hostmeta = function(req, res) {
    res.json({
        links: [
            {
                rel: "dialback",
                href: ih8it.url("/dialback")
            }
        ]
    });
};

exports.index = function(req, res, next) {
    var hosts, users, bank = Host.bank();

    if (req.user) {
        res.render('userindex', { title: "Home", user: req.user });
    } else {
        res.render('index', { title: "Welcome" });
    }
};

exports.about = function(req, res) {
    res.render('about', { title: "About" });
};

exports.login = function(req, res) {
    res.render('login', { title: "Login" });
};

exports.handleLogin = function(req, res, next) {

    var id = req.body.webfinger,
        hostname = User.getHostname(id),
        host;
    
    async.waterfall([
        function(callback) {
            Host.ensureHost(hostname, callback);
        },
        function(results, callback) {
            host = results;
            host.getRequestToken(callback);
        }
    ], function(err, rt) {
        if (err) {
            if (err instanceof Error) {
                next(err);
            } else if (err.data) {
                next(new Error(err.data));
            }
        } else {
            res.redirect(host.authorizeURL(rt));
        }
    });
};

exports.authorized = function(req, res, next) {

    var hostname = req.params.hostname,
        token = req.query.oauth_token,
        verifier = req.query.oauth_verifier,
        rt,
        host,
        access_token,
        token_secret,
        id,
        object,
        newUser = false;

    async.waterfall([
        function(callback) {
            async.parallel([
                function(callback) {
                    RequestToken.get(RequestToken.key(hostname, token), callback);
                },
                function(callback) {
                    Host.get(hostname, callback);
                }
            ], callback);
        },
        function(results, callback) {
            rt = results[0];
            host = results[1];
            host.getAccessToken(rt, verifier, callback);
        },
        function(token, secret, extra, callback) {
            access_token = token;
            token_secret = secret;
            async.parallel([
                function(callback) {
                    rt.del(callback);
                },
                function(callback) {
                    host.whoami(access_token, token_secret, callback);
                }
            ], callback);
        },
        function(results, callback) {
            object = results[1];
            id = object.id;
            if (id.substr(0, 5) == "acct:") {
                id = id.substr(5);
            }
            User.get(id, function(err, user) {
                if (err && err.name === "NoSuchThingError") {
                    newUser = true;
                    User.fromPerson(object, access_token, token_secret, callback);
                } else if (err) {
                    callback(err, null);
                } else {
                    callback(null, user);
                }
            });
        }
    ], function(err, user) {
        if (err) {
            next(err);
        } else {
            req.session.userID = user.id;
            res.redirect("/");
        }
    });
};

exports.handleLogout = function(req, res) {

    delete req.session.userID;
    delete req.user;

    res.redirect("/", 303);
};

exports.showH8 = function(req, res) {

    var url = req.query.url;

    async.waterfall([
        function(callback) {
            ActivityObject.ensure(url, callback);
        }
    ], function(err, aobj) {
        if (err) {
            next(err);
        } else {
            res.render("h8", {title: "h8 this", url: url, aobj: aobj});
        }
    });
};

exports.doH8 = function(req, res, next) {

    var user = req.user,
        url = req.body.url;

    async.waterfall([
        function(callback) {
            ActivityObject.ensure(url, callback);
        },
        function(aobj, callback) {
            var now = new Date();
            user.postActivity({
                verb: "dislike",
                object: aobj,
                published: now.toISOString()
            }, callback);
        }
    ], function(err, posted) {
        if (err) {
            next(err);
        } else {
            // XXX: show indicator that h8 happened
            res.redirect("/", 303);
        }
    });
};
