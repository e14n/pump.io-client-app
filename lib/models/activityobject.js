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
    http = require("http"),
    https = require("https"),
    async = require("async"),
    jsdom = require("jsdom"),
    urlparse = require("url").parse,
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

ActivityObject.pkey = function() {
    return "url";
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

ActivityObject.httpHead = function(url, callback) {

    var options = urlparse(url),
        mod = (options.protocol == 'https:') ? https : http;

    options.headers = {
        "User-Agent": ih8it.userAgent()
    };

    mod.request(options, function(resp) {
        var redir, data;
        if (resp.statusCode >= 400 && resp.statusCode < 600) {
            callback(new Error("Bad response"), null);
        } else if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.statusCode != 304 && resp.headers.location) {
            // XXX: loop detection
            ActivityObject.httpHead(resp.headers.location, callback);
        } else if (resp.statusCode >= 200 && resp.statusCode < 300) {
            callback(null, resp);
        } else {
            callback(new Error("Unexpected status code: " + resp.statusCode), null);
        }
    }).on('error', function(err) {
        callback(err, null);
    }).end();
};

ActivityObject.httpGet = function(url, callback) {

    var options = urlparse(url),
        mod = (options.protocol == 'https:') ? https : http;

    options.headers = {
        "User-Agent": ih8it.userAgent()
    };

    mod.request(options, function(resp) {
        var redir, data;
        if (resp.statusCode >= 400 && resp.statusCode < 600) {
            callback(new Error("Bad response"), null, null);
        } else if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.statusCode != 304 && resp.headers.location) {
            // XXX: loop detection
            ActivityObject.httpGet(resp.headers.location, callback);
        } else if (resp.statusCode >= 200 && resp.statusCode < 300) {
            if (ActivityObject.binaryContentType(resp)) {
                data= new Buffer(0);
                resp.on('data', function (chunk) {
                    data= Buffer.concat([data, chunk]);
                });
            } else {
                data="";
                resp.setEncoding('utf8');
                resp.on('data', function (chunk) {
                    data+=chunk;
                });
            }
            resp.on("error", function(err) {
                callback(err, null, null);
            });
            resp.on("end", function() {
                callback(null, resp, data);
            });
        } else {
            callback(new Error("Unexpected status code: " + resp.statusCode), null, null);
        }
    }).on('error', function(err) {
        callback(err, null, null);
    }).end();
};

ActivityObject.binaryContentType = function(response) {
    var contentType;
    if (!response.headers || !response.headers["content-type"]) {
        return false;
    }
    contentType = response.headers["content-type"];
    return (contentType.match(/^image\//) ||
            contentType.match(/^audio\//) ||
            contentType.match(/^video\//));
};

ActivityObject.discover = function(url, callback) {

    async.waterfall([
        function(callback) {
            ActivityObject.httpHead(url, callback);
        },
        function(resp, callback) {
            var contentType;
            if (!resp.headers || !resp.headers["content-type"]) {
                contentType = "application/octet-stream";
            } else {
                contentType = resp.headers["content-type"];
            }

            if (contentType.substr(0, 9) == "text/html") {
                ActivityObject.discoverOpenGraph(url, callback);
            } else if (contentType.match(/^image\//)) {
                ActivityObject.create({url: url, objectType: "image", displayName: "an image"}, callback);
            } else if (contentType.match(/^audio\//)) {
                ActivityObject.create({url: url, objectType: "audio", displayName: "an audio file"}, callback);
            } else if (contentType.match(/^video\//)) {
                ActivityObject.create({url: url, objectType: "video", displayName: "a video file"}, callback);
            } else {
                ActivityObject.create({url: url, objectType: "file", displayName: "a file"}, callback);
            }
        }
    ], callback);
};

ActivityObject.discoverOpenGraph = function(url, callback) {

    var props;

    async.waterfall([
        function(callback) {
            ActivityObject.httpGet(url, callback);
        },
        function(resp, body, callback) {
            jsdom.env({html: body, url: url, done: callback});
        },
        function(window, callback) {
	    var ogData = ActivityObject.parseOGP(window);

            props = {url: url};

            if (_.isEmpty(ogData)) {
                _.extend(props, {
                    objectType: "page",
                    displayName: window.document.title || "A Web Page"
                });
            } else {
                _.extend(props, {
                    displayName: ogData.title || window.document.title || "A Web Page",
                    url: ogData.url || url
                });
                if (ogData.image) {
                    props.image = {
                        url: ogData.image
                    };
                    if (ogData["image:width"]) {
                        props.image.width = ogData["image:width"];
                    }
                    if (ogData["image:height"]) {
                        props.image.width = ogData["image:height"];
                    }
                }
                if (ogData.description) {
                    props.summary = ogData.description;
                }
                switch (ogData.type) {
                case "music.song":
                    props.objectType = "audio";
                    break;
                case "music.album":
                    props.objectType = "audio";
                    break;
                case "music.playlist":
                    props.objectType = "audio";
                    break;
                case "music.radio_station":
                    props.objectType = "audio";
                    break;
                case "video.movie":
                    props.objectType = "video";
                    break;
                case "video.episode":
                    props.objectType = "video";
                    break;
                case "video.tv_show":
                    props.objectType = "video";
                    break;
                case "video.other":
                    props.objectType = "video";
                    break;
                case "article":
                    props.objectType = "article";
                    break;
                case "book":
                    props.objectType = "product";
                    break;
                case "profile":
                    props.objectType = "person";
                    break;
                case "website":
                    props.objectType = "service";
                    break;
                default:
                    props.objectType = "page";
                    break;
                }
            }
            ActivityObject.create(props, callback);
        }
    ], function(err, aobj) {
        if (err && err.name == "AlreadyExistsError") { // sheesh
            ActivityObject.get(props.url, callback);
        } else if (err) {
            callback(err, null);
        } else {
            callback(null, aobj);
        }
    });
};

// From node-ogp 0.0.2
// Copyright (c) 2011 Yury Proshchenko (spect.man@gmail.com)
// MIT license
// Scooped, reformatted, debugged

ActivityObject.parseOGP = function(window) {

    var ns;

    for (var i = 0; i < window.document.documentElement.attributes.length; ++i) {
	var attr = window.document.documentElement.attributes[i];
	if (attr.nodeValue.toLowerCase() !== 'http://opengraphprotocol.org/schema/' && 
            attr.nodeValue.toLowerCase() !== 'http://ogp.me/ns#') {
            continue;
        }
	ns = attr.nodeName.substring(6);
	if (ns) break;
    }

    if (!ns) return {};

    console.dir({ns: ns});

    var result = {},
	metaTags = window.document.getElementsByTagName('meta');

    for (var i = 0; i < metaTags.length; ++i) {
	var tag = metaTags[i],
	    propertyAttr = tag.attributes['property'];

	if (!propertyAttr || propertyAttr.nodeValue.substring(0, ns.length) !== ns)
	    continue;

	var property = tag.attributes['property'].nodeValue.substring(ns.length+1),
	    content = tag.attributes['content'].nodeValue;

	if (!result[property])
	    result[property] = content;
	else if (result[property].push)
	    result[property].push(content);
	else
	    result[property] = [result[property], content];
    }

    return result;
};

module.exports = ActivityObject;
