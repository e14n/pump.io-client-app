// app.js
//
// entrypoint for pump.io-enabled node.js apps
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

var async = require("async"),
    User = require("./models/user"),
    RememberMe = require("./models/rememberme");

// Auth middleware

var userAuth = function(req, res, next) {

    req.user = null;
    res.local("user", null);

    if (req.session.userID) {
        req.log.info({userID: req.session.userID}, "Logging in with session-stored user ID");
        User.get(req.session.userID, function(err, user) {
            if (err) {
                next(err);
            } else {
                req.log.info({userID: user.id}, "Logged in");
                req.user = user;
                res.local("user", user);
                next();
            }
        });
    } else if (req.cookies.rememberme) {
        req.log.info({rememberme: req.cookies.rememberme}, "Logging in with rememberme cookie");
        async.waterfall([
            function(callback) {
                RememberMe.get(req.cookies.rememberme, callback);
            },
            function(rm, callback) {
                var id = rm.user;
                req.log.info({rememberme: req.cookies.rememberme, userID: id}, "Found rememberme cookie");
                async.parallel([
                    function(callback) {
                        rm.del(callback);
                    },
                    function(callback) {
                        User.get(id, callback);
                    },
                    function(callback) {
                        RememberMe.create({user: id}, callback);
                    }
                ], callback);
            }
        ], function(err, results) {
            var rm, user;
            if (err && err.name == "NoSuchThingError") {
                // Clear the cookie and continue
                res.clearCookie("rememberme", {path: "/"});
                next();
            } else if (err) {
                next(err);
            } else {

                user = results[1];
                rm = results[2];

                req.user = user;
                res.local("user", req.user);
                req.session.userID = req.user.id;
                req.log.info({userID: req.user.id}, "Set user");

                res.cookie("rememberme", rm.uuid, {path: "/", expires: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), httpOnly: true});
                req.log.info({rememberme: rm.uuid, userID: req.user.id}, "Set rememberme cookie");

                next();
            }
        });
    } else {
        next();
    }
};

var userOptional = function(req, res, next) {
    next();
};

var userRequired = function(req, res, next) {
    if (!req.user) {
        next(new Error("User is required"));
    } else {
        next();
    }
};

var noUser = function(req, res, next) {
    if (req.user) {
        next(new Error("Already logged in"));
    } else {
        next();
    }
};

var userIsUser = function(req, res, next) {
    if (req.params.webfinger && req.user.id == req.params.webfinger) {
        next();
    } else {
        next(new Error("Must be the same user"));
    }
};

module.exports = {
    userAuth: userAuth,
    userOptional: userOptional,
    userRequired: userRequired,
    noUser: noUser,
    userIsUser: userIsUser
};
