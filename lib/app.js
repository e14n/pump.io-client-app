// app.js
//
// main function for h8in
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

var fs = require("fs"),
    async = require("async"),
    path = require("path"),
    _ = require("underscore"),
    express = require('express'),
    DialbackClient = require("dialback-client"),
    Logger = require("bunyan"),
    routes = require('./routes'),
    databank = require("databank"),
    uuid = require("node-uuid"),
    Databank = databank.Databank,
    DatabankObject = databank.DatabankObject,
    DatabankStore = require('connect-databank')(express),
    RequestToken = require("./models/requesttoken"),
    RememberMe = require("./models/rememberme"),
    User = require("./models/user"),
    Host = require("./models/host"),
    ih8it = require("./models/ih8it"),
    config,
    defaults = {
        port: 4000,
        address: "localhost",
        hostname: "localhost",
        driver: "disk",
        name: "ih8.it",
        description: "Widget for hating things on the federated social web.",
        verb: "dislike"
    },
    log,
    logParams = {
        name: "ih8.it",
        serializers: {
            req: Logger.stdSerializers.req,
            res: Logger.stdSerializers.res
        }
    };

if (fs.existsSync("/etc/ih8.it.json")) {
    config = _.defaults(JSON.parse(fs.readFileSync("/etc/ih8.it.json")),
                        defaults);
} else {
    config = defaults;
}

if (config.logfile) {
    logParams.streams = [{path: config.logfile}];
} else if (config.nologger) {
    logParams.streams = [{path: "/dev/null"}];
} else {
    logParams.streams = [{stream: process.stderr}];
}

log = new Logger(logParams);

log.info("Initializing");

// Configure the service object

log.info({name: config.name, 
          description: config.description, 
          hostname: config.hostname},
         "Initializing ih8it object");

ih8it.name        = config.name;
ih8it.description = config.description;
ih8it.hostname    = config.hostname;

ih8it.protocol = (config.key) ? "https" : "http";

if (!config.params) {
    if (config.driver == "disk") {
        config.params = {dir: "/var/lib/ih8.it/"};
    } else {
        config.params = {};
    }
}

// Define the database schema

if (!config.params.schema) {
    config.params.schema = {};
}

_.extend(config.params.schema, DialbackClient.schema);
_.extend(config.params.schema, DatabankStore.schema);

// Now, our stuff

_.each([RequestToken, Host, RememberMe], function(Cls) {
    config.params.schema[Cls.type] = Cls.schema;
});

// User has a global list

_.extend(config.params.schema, User.schema);
_.extend(config.params.schema, Host.schema);

var db = Databank.get(config.driver, config.params);

async.waterfall([
    function(callback) {
        log.info({driver: config.driver, params: config.params}, "Connecting to DB");
        db.connect({}, callback);
    },
    function(callback) {

        var app,
            bounce,
            client,
            requestLogger = function(log) {
                return function(req, res, next) {
                    var weblog = log.child({"req_id": uuid.v4(), component: "web"});
                    var end = res.end;
                    req.log = weblog;
                    res.end = function(chunk, encoding) {
                        var rec;
                        res.end = end;
                        res.end(chunk, encoding);
                        rec = {req: req, res: res};
                        weblog.info(rec);
                    };
                    next();
                };
            };

        // Set global databank info

        DatabankObject.bank = db;

        if (_.has(config, "key")) {

            log.info("Using SSL");

            app = express.createServer({key: fs.readFileSync(config.key),
                                        cert: fs.readFileSync(config.cert)});
            bounce = express.createServer(function(req, res, next) {
                var host = req.header('Host');
                res.redirect('https://'+host+req.url, 301);
            });

        } else {

            log.info("Not using SSL");

            app = express.createServer();
        }

        // Configuration

        var dbstore = new DatabankStore(db, log, 60000);

        log.info("Configuring app");

        app.configure(function(){
            var serverVersion = 'ih8.it/'+ih8it.version + ' express/'+express.version + ' node.js/'+process.version,
                versionStamp = function(req, res, next) {
                    res.setHeader('Server', serverVersion);
                    next();
                },
                appObject = function(req, res, next) {
                    req.ih8it = ih8it;
                    res.local("ih8it", ih8it);
                    next();
                };

            app.set('views', __dirname + '/views');
            app.set('view engine', 'utml');
            app.use(requestLogger(log));
            app.use(versionStamp);
            app.use(appObject);
            app.use(express.bodyParser());
            app.use(express.cookieParser());
            app.use(express.methodOverride());
            app.use(express.session({secret: (_(config).has('sessionSecret')) ? config.sessionSecret : "insecure",
                                     cookie: {path: '/', httpOnly: true},
                                     store: dbstore}));
            app.use(app.router);
            app.use(express.static(__dirname + '/public'));
        });

        app.configure('development', function(){
            app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
        });

        app.configure('production', function(){
            app.use(express.errorHandler());
        });

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

        // Routes

        log.info("Initializing routes");

        app.get('/', userAuth, userOptional, routes.index);
        app.get('/login', userAuth, noUser, routes.login);
        app.post('/login', userAuth, noUser, routes.handleLogin);
        app.post('/logout', userAuth, userRequired, routes.handleLogout);
        app.get('/about', userAuth, userOptional, routes.about);
        app.get('/h8', userAuth, userRequired, routes.showH8);
        app.post('/h8', userAuth, userRequired, routes.doH8);
        app.get('/authorized/:hostname', routes.authorized);
        app.get('/.well-known/host-meta.json', routes.hostmeta);

        // Create a dialback client

        log.info("Initializing dialback client");

        client = new DialbackClient({
            hostname: config.hostname,
            app: app,
            bank: db,
            userAgent: ih8it.userAgent()
        });

        // Configure this global object

        Host.dialbackClient = client;

        // Let Web stuff get to config

        app.config = config;

        // For handling errors

        app.log = function(obj) {
            if (obj instanceof Error) {
                log.error(obj);
            } else {
                log.info(obj);
            }
        };

        // Start the app

        log.info({port: config.port, address: config.address}, "Starting app listener");

        app.listen(config.port, config.address, callback);

        // Start the bouncer

        if (bounce) {
            log.info({port: 80, address: config.address}, "Starting bounce listener");
            bounce.listen(80, config.address);
        }

    }], function(err) {
        if (err) {
            log.error(err);
        } else {
            console.log("Express server listening on address %s port %d", config.address, config.port);
        }
});    
