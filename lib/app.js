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

var fs = require("fs"),
    async = require("async"),
    path = require("path"),
    http = require("http"),
    https = require("https"),
    _ = require("underscore"),
    express = require('express'),
    bodyParser = require('body-parser'),
    cookieParser = require('cookie-parser'),
    session = require('express-session'),
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
    site = require("./models/site"),
    auth = require("./auth.js"),
    utmlish = require("./utmlish"),
    defaults = {
        port: 4000,
        hostname: "localhost",
        driver: "memory",
        params: null,
        name: "An unconfigured pump.io client",
        description: "A pump.io client that is not correctly configured.",
        logfile: null,
        loglevel: "info",
        nologger: false,
        key: null,
        cert: null,
        sessionSecret: "insecure",
        static: null,
        address: null,
        useCDN: true,
        scripts: [],
        styles: []
    };

var PumpIOClientApp = function(configArg) {

    var clap = this,
        config = _.defaults(configArg, defaults),
        log,
        db,
        app,
        setupLog = function() {
            var logParams = {
                serializers: {
                    req: Logger.stdSerializers.req,
                    res: Logger.stdSerializers.res,
                    err: Logger.stdSerializers.err
                },
                level: config.loglevel
            };

            if (config.logfile) {
                logParams.streams = [{path: config.logfile}];
            } else if (config.nologger) {
                logParams.streams = [{path: "/dev/null"}];
            } else {
                logParams.streams = [{stream: process.stderr}];
            }

            logParams.name = config.name;

            log = new Logger(logParams);

            log.debug("Initializing");

            // Configure the service object

            log.debug({name: config.name,
                      description: config.description,
                      hostname: config.hostname},
                     "Initializing site object");
        },
        setupSite = function() {
            site.name        = config.name;
            site.description = config.description;
            site.hostname    = config.hostname;

            site.protocol = (config.key) ? "https" : "http";
        },
        setupDB = function(callback) {
            if (!config.params) {
                if (config.driver == "disk") {
                    config.params = {dir: "/var/lib/"+config.hostname+"/"};
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

            _.each([User, Host, RequestToken, RememberMe], function(Cls) {
                config.params.schema[Cls.type] = Cls.schema;
            });

            db = Databank.get(config.driver, config.params);

            log.debug({driver: config.driver, params: config.params},
                     "Connecting to DB");

            // Set global databank info

            DatabankObject.bank = db;
        },
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
        },
        viewResolver = function(req, res, next) {
            var render = res.render;
            res.render = function(view, options, callback) {
                utmlish.resolve(view, function(err, fullname) {
                    if (err) {
                        // Uhhh...
                    } else {
                        res.render = render;
                        res.render(fullname, options, callback);
                    }
                });
            };
            next();
        },
        setupApp = function() {
            var client;

            app = new express();

            // Configuration

            var dbstore = new DatabankStore(db, log, 60000);

            // UTML-ish rendering engine

            utmlish.viewDirs.unshift(path.join(__dirname, 'views'));

            if (config.views) {
                utmlish.viewDirs.unshift(config.views);
            }

            log.debug("Configuring app");

            app.configure(function(){
                var serverVersion = site.userAgent() + ' express/'+express.version + ' node.js/'+process.version,
                    versionStamp = function(req, res, next) {
                        res.setHeader('Server', serverVersion);
                        next();
                    },
                    appObject = function(req, res, next) {
                        req.site = site;
                        res.locals.site = site;
                        res.locals.config = req.app.config;
                        next();
                    };

                app.set('views', path.join(__dirname, 'views'));
                app.set('view engine', 'utml');
                app.engine('utml', utmlish);
                app.use(requestLogger(log));
                app.use(viewResolver);
                app.use(versionStamp);
                app.use(appObject);
                app.use(bodyParser.json());
                app.use(bodyParser.urlencoded());
                app.use(cookieParser());
                app.use(session({secret: config.sessionSecret,
                                 cookie: {path: '/', httpOnly: true},
                                 store: dbstore}));
                app.use(app.router);
                if (config.static) {
                    app.use(express.static(config.static));
                }
                app.use(express.static(path.join(__dirname, 'public')));
            });

            app.configure('development', function(){
                app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
            });

            app.configure('production', function(){
                app.use(express.errorHandler());
            });

            // Routes

            log.debug("Initializing routes");

            app.get('/', auth.userAuth, auth.userOptional, routes.index);
            app.get('/login', auth.userAuth, auth.noUser, routes.login);
            app.post('/login', auth.userAuth, auth.noUser, routes.handleLogin);
            app.post('/logout', auth.userAuth, auth.userRequired, routes.handleLogout);
            app.get('/about', auth.userAuth, auth.userOptional, routes.about);
            app.get('/authorized/:hostname', routes.authorized);
            app.get('/.well-known/host-meta.json', routes.hostmeta);

            // Create a dialback client

            log.debug("Initializing dialback client");

            client = new DialbackClient({
                hostname: config.hostname,
                app: app,
                bank: db,
                userAgent: site.userAgent()
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
        };

    // Dynamic default

    if (!config.address) {
        config.address = config.hostname;
    }

    // Set up aspects

    setupLog();
    setupSite();
    setupDB();
    setupApp();

    // Delegate

    _.each(_.functions(app), function(name) {
        clap[name] = function() {
            app[name].apply(app, arguments);
        };
    });

    // Expose the log so clients can use it

    clap.log = log;

    // Expose the site so clients can use it

    clap.site = site;

    // Run

    clap.run = function(callback) {

        var srv,
            bounce;

        if (config.key) {

            log.debug("Using SSL");

            srv = https.createServer({key: fs.readFileSync(config.key),
                                      cert: fs.readFileSync(config.cert)},
                                     app);

            bounce = http.createServer(function(req, res, next) {
                var host = req.headers.host,
                    url = 'https://'+host+req.url;
                res.writeHead(301, {'Location': url,
                                    'Content-Type': 'text/html'});
                res.end('<a href="'+url+'">'+url+'</a>');
            });

        } else {
            log.debug("Not using SSL");
            srv = http.createServer(app);
        }

        // Start the app

        async.waterfall([
            function(callback) {
                db.connect(config.params, callback);
            },
            function(callback) {
                // Wrapper function to give a callback-like interface to network servers
                var listenBack = function(server, port, address, callback) {
                    var a,
                        removeListeners = function() {
                            server.removeListener("listening", listenSuccessHandler);
                            server.removeListener("error", listenErrorHandler);
                        },
                        listenErrorHandler = function(err) {
                            removeListeners();
                            callback(err);
                        },
                        listenSuccessHandler = function() {
                            removeListeners();
                            callback(null);
                        };
                    server.on("error", listenErrorHandler);
                    server.on("listening", listenSuccessHandler);
                    server.listen(port, address);
                };

                async.parallel([
                    function(callback) {
                        log.debug({port: config.port, address: config.address}, "Starting app listener");
                        listenBack(srv, config.port, config.address, callback);
                    },
                    function(callback) {
                        if (bounce) {
                            log.debug({port: 80, address: config.address}, "Starting bounce listener");
                            listenBack(bounce, 80, config.address, callback);
                        } else {
                            callback(null, null);
                        }
                    }
                ], callback);
            }
        ], function(err, results) {
            // Ignore meaningless results
            callback(err);
        });
    };
};

// Export the auth methods

_.each(_.keys(auth), function(key) {
    PumpIOClientApp[key] = auth[key];
});

// Export the model classes

PumpIOClientApp.User = User;
PumpIOClientApp.Host = Host;
PumpIOClientApp.RequestToken = RequestToken;
PumpIOClientApp.RememberMe = RememberMe;

module.exports = PumpIOClientApp;
