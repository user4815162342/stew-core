var path = require("path");
var sfms = require("SFMS");
var properties = require("./properties");
var tags = require("./tags");
var docs = require("./docs");
var attachments = require("./attachments");
var fs = require('fs');
var ncp = require("ncp");
var Q = require('q');

// this automatically 'extends' doc to be publishable.
require("./publish");

/*
 * TODO: I need to review this API and simplify it.
 * 1) Look again at all of the functions, to be absolutely sure we
 * need to have them all async.
 * 2) Possibly make use of promises.
 * */

/**
 * A private cache for the _stew.json data.
 * */
var _stew = function(p) {
    var cache = null;
    var filename = path.join(p,"_stew.json");
    
    this.read = function() {
        if (cache === null) {
            // TODO: Switch to q-io
            return Q.nbind(fs.readFile,fs)(filename,{ encoding: 'utf8' }).then(function(data) {
                return JSON.parse(data);
            })
        }
        return Q.resolve(cache);
    }
    
    this.save = function(data) {
        return Q.nbind(fs.writeFile,fs)(filename,JSON.stringify(data,null,"  "),{ encoding: 'utf8' }).then(function() {
            cache = data;
        })
    }
    
    this.clear = function() {
        cache = null;
    }
}

/**
 * Allows accessing the root folder contents of the Project.
 * */
var ProjectRootContent = function(project) {
    this._project = project;
    this._path = "/";
}

docs.DirectoryIndex(ProjectRootContent.prototype,docs.Doc);

docs.PathFunctions(ProjectRootContent.prototype);

ProjectRootContent.prototype.properties = function() {
    // TODO: propCache is defined in sfms. Switch to promises there.
    return Q.nbind(this._project._propCache.readProperties,this._project._propCache)(this.diskPath(),true).then(function(data) {
        var write = function(data) {
            return Q.nbind(this._project._propCache.saveProperties,this._project._propCache)(this.diskPath(),data,true);
        }.bind(this);
        new properties.ProjectRootProperties(data,write);
    });
}

attachments.Notes(ProjectRootContent.prototype,true);



/**
 *  ## StewProject *class*
 * */
var StewProject = module.exports = function(p) {
    this._base = p;
    this._propCache = new sfms.ps.PropertiesCache();
    this._stew = new _stew(this._base);
    this._content = new ProjectRootContent(this);
}

StewProject.prototype.basePath = function() {
    return this._base;
}

/**
 * Properties and a few other settings are stored in a cache 
 * to reduce disk access on complex operatiosn. This function clears 
 * the cache to force everything to be reloaded from disk when it's 
 * needed. Use this at times when you think things might have changed.
 * */
StewProject.prototype.clearCache = function() {
    this._propCache.clear();
    this._stew.clear();
}

/**
 * This is used to find "blanks" for different file extensions when
 * "ensuring" the primary file and notes.
 * */
StewProject.prototype.findBlank = function(ext) {
    // in project blank
    var blankPath = path.join(this.basePath(),"_templates","blank." + ext);
    var q = Q.defer(); // Can't use Q.nbind because fs.exists isn't a normal node async.
    // TODO: Switch to q-io
    fs.exists(blankPath,function(exists) {
        if (exists) {
            return q.resolve(blankPath);
        } else {
            // look in the basic one.
            try {
                blankPath = require.resolve("./" + path.join("templates","blank." + ext))
                return q.resolve(blankPath);
            } catch (err) {
                if (err.code && (err.code === "MODULE_NOT_FOUND")) {
                    return q.resolve()
                }
                return q.reject(err);
            }
        }
    });
    return q.promise;
}

StewProject.prototype.copyBlank = function(targetPath) {
    var ext = path.extname(targetPath).slice(1);
    return this.findBlank(ext).then(function(blankPath) {
        if (typeof blankPath !== "undefined") {
            // TODO: Switch to q-io? Or, maybe ncp has a promise version.
            return Q.nbind(ncp)(blankPath,targetPath,{ clobber: false, stopOnError: true}).then(function() {
                return targetPath;
            });
        } else {
            // no blank template found, so just write a blank file and hope it works.
            return Q.nbind(fs.writeFile,fs)(targetPath,"",{ encoding: 'utf8', flag: "wx" }).then(function() {
                return targetPath;
            });
        }
    });
    
}

/**
 * ### *async* stew() *Properties*
 * */
StewProject.prototype.stew = function() {
    return this._stew.read().then(function(data) {
        return new properties.StewProperties(data,this._stew.save.bind(this._stew));
    }.bind(this));
}

/**
 * ### tags() *Tags*
 * */
StewProject.prototype.tags = function() {
    return new tags.TagContent(this,path.join(this._base,"_tags"));
}

StewProject.prototype.root = function() {
    return this._content;
}

