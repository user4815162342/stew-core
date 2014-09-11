var path = require("path");
var sfms = require("SFMS");
var properties = require("./properties");
var tags = require("./tags");
var docs = require("./docs");
var attachments = require("./attachments");
var fs = require('fs');
var ncp = require("ncp");

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
    
    this.read = function(cb) {
        if (cache === null) {
            return fs.readFile(filename,{ encoding: 'utf8' },function(err,data) {
                if (err) {
                    return cb(err);
                }
                try {
                    cache = JSON.parse(data);
                } catch (e) {
                    cb(e);
                }
                return cb(null,cache);
            });
        }
        return cb(null,cache);
    }
    
    this.save = function(data,cb) {
        fs.writeFile(filename,JSON.stringify(data,null,"  "),{ encoding: 'utf8' },function(err) {
            if (err) {
                return cb(err);
            }
            cache = data;
        });
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

ProjectRootContent.prototype.properties = function(cb) {
    this._project._propCache.readProperties(this.diskPath(),true,function(err,data) {
        if (err) {
            return cb(err);
        }
        var write = function(data,cb) {
            this._project._propCache.saveProperties(this.diskPath(),data,true,cb);
        }.bind(this);
        return cb(null,new properties.ProjectRootProperties(data,write));
    }.bind(this));
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
StewProject.prototype.findBlank = function(ext,cb) {
    // in project blank
    var blankPath = path.join(this.basePath(),"_templates","blank." + ext);
    return fs.exists(blankPath,function(exists) {
        if (exists) {
            cb(null,blankPath);
        } else {
            // look in the basic one.
            try {
                blankPath = require.resolve("./" + path.join("templates","blank." + ext))
                return cb(null,blankPath);
            } catch (err) {
                if (err.code && (err.code === "MODULE_NOT_FOUND")) {
                    return cb()
                }
                return cb(err);
            }
        }
    });
    
}

StewProject.prototype.copyBlank = function(targetPath,cb) {
    var ext = path.extname(targetPath).slice(1);
    this.findBlank(ext,function(err,blankPath) {
        if (err) {
            return cb(err);
        }
        if (typeof blankPath !== "undefined") {
            return ncp(blankPath,targetPath,{ clobber: false, stopOnError: true},function(err) {
                if (err) {
                    return cb(err);
                }
                return cb(null,targetPath);
            });
        } else {
            // no blank template found, so just write a blank file and hope it works.
            return fs.writeFile(targetPath,"",{ encoding: 'utf8', flag: "wx" },function(err) {
                cb(err,targetPath);
            });
        }
    });
    
}

/**
 * ### *async* stew() *Properties*
 * */
StewProject.prototype.stew = function(cb) {
    this._stew.read(function(err,data) {
        if (err) {
            return cb(err);
        }
        return cb(null,new properties.StewProperties(data,this._stew.save.bind(this._stew)));
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

