var path = require('path');
var mkdirp = require('mkdirp');
var sfms = require("SFMS");
var fs = require('fs');
var StewError = require("./errors.js").StewError;
var properties = require("./properties");
var attachments = require("./attachments");

/**
 * This is a mixin that allows the class to behave as a directory folder
 * containing Documents.
 * 
 * Requires this._project and this._path.
 * */
var DirectoryIndex = module.exports.DirectoryIndex = function(prototype,ContentItem,dontSort) {

    var filterItems = function(list,result,filter,cb) {
        if (list.length) {
            var doc = list.shift();
            filter(doc,function(err,pass,recurse) {
                if (err) {
                    return cb(err);
                }
                if (pass) {
                    result.push(doc);
                }
                if (recurse) {
                    return doc.listDocs(filter,function(err,children) {
                        if (err) {
                            return cb(err);
                        } else {
                            result = result.concat(children);
                            // in case everything is cached, we need to
                            // take an occasional break.
                            process.nextTick(function() {
                                filterItems(list,result,filter,cb);
                            });
                        }
                    });
                } else {
                    // continue on with the next item in the list.
                    // in case everything is cached, we need to
                    // take an occasional break.
                    return process.nextTick(function() {
                        filterItems(list,result,filter,cb);
                    });
                }
            });
        } else {
            cb(null,result);
        }
    }
    
    var recursiveFilter = function(doc,cb) {
        cb(null,true,true);
    }
    
    var nonRecursiveFilter = function(doc,cb) {
        cb(null,true,false);
    }
    
    
    /**
     * ### *async* list(options?) *array of Doc*
     * 
     * options can be:
     * - a boolean indicating that the listing should be recursive
     * - a function that takes a document object and calls a callback with
     *   three arguments:
     *      1) error, 
     *      2) whether the object itself should be included (default true)
     *      3) whether the object's contents should be considered (default: false)
     * */
    prototype.listDocs = function(options,cb) {
        if (arguments.length === 1) {
            cb = options;
            options = false;
        }
        if (typeof options !== "function") {
            if (!!options) {
                // truthy, so default is a function that allows all docs
                // and recurses.
                options = recursiveFilter;
            } else {
                // falsy, so default is a function that allows all docs
                // and doesn't recurse.
                options = nonRecursiveFilter;
            }
        }
        // directories should not have extensions here.
        fs.readdir(this.diskPath(),function(err,list) {
            if (err) {
                if (err.code && ((err.code === "ENOTDIR") || (err.code === "ENOENT"))) {
                    // not a directory, so return an empty list.
                    return cb(null,[]);
                }
                return cb(err);
            }
            try {
                // clear out hidden files. Stew does not deal with them
                // (and in fact, tools are allowed to use them for settings)
                list = list.filter(function(file) {
                    return file[0] !== ".";
                });
                
                // need full paths.
                list = list.map(function(file) {
                    return path.join(this.diskPath(),file);
                }.bind(this));
                // now, filter down into just the packets..
                list = sfms.path.packets(list);
                
                var handleResults = function(err,list) {
                    if (err) {
                        return cb(err);
                    } 
                    try {
                        // our result needs to be mapped into Doc objects.
                        list = list.map(function(path) {
                            return new ContentItem(this._project,path.slice(this._project.basePath().length));
                        }.bind(this));
                        filterItems(list,[],options,cb);
                    } catch (e) {
                        return cb(e);
                    }
                }.bind(this);
                // and then, we need to sort
                if (!dontSort) {
                    var sort = sfms.sort.sortByDirectoryProperty("index",true,this._project._propCache);
                    list = sfms.sort.sortBy(list,sort,handleResults);
                } else {
                    handleResults(null,list);
                }
            } catch (e) {
                return cb(e);
            }
            
        }.bind(this));
    }
    
    var isPathTroublesome = function(p) {
        // since we allow relative paths, and create directories on the run,
        // this might be a deep directory, so check if each one is troublesome.
        // Yes, I *should* stop where the path ends, but for all I know
        // this resolves to a path at the root, and checking isn't that
        // simple.
        var dir;
        while (true) {
            if (sfms.path.isTroublesome(path.basename(p)) || (p === "")) {
                return true;
            }
            dir = path.dirname(p);
            if (dir === p) {
                // we've reached the root, so:
                return false;
            }
            p = dir;
        }
        return false;
    }
    
 
    /** 
     * ### *async* add(name) *Doc*
     * */
    prototype.addDoc = function(name,cb) {
        // since this.path is rooted to the base of the project, it's impossible
        // to add a relative doc by using '..' in the name.
        var newDocPath = path.resolve(this.path(),name);
        if (isPathTroublesome(newDocPath)) {
            return cb(new StewError("Attempted to create a document with a troublesome name.","TROUBLESOME NAME"));
        }
        var newPacket = path.join(this._project.basePath(),newDocPath);
        // need to ensure the directory exists.
        mkdirp(path.dirname(newPacket),function(err) {
            if (err) {
                return cb(err);
            }
            // else create the properties file so there's something there.
            // 'wx' flag should fail if the file already exists.
            fs.writeFile(newPacket + "_properties.json","{}",{ encoding: 'utf8', flag: "wx"},function(err) {
                if (err) {
                    if (err.code && (err.code === "EEXIST")) {
                        return cb(new StewError("Attempted to add a document that already exists.","EXISTING DOC"));
                    }
                    return cb(err);
                }
                return cb(null,new ContentItem(this._project,newDocPath));
            });
        });
    }
    
    /**
     * ### *async* get(path) *Doc*
     * 
     * Attempts to find a Doc relative to this doc.
     * */
    prototype.getDoc = function(p,cb) {
        // We only want to get the actual packet. If the user tried to
        // trick us by passing in a filename (or, more likely, if this was automatically
        // provided by a globbing at the command line) than we just want the
        // packet.
        p = sfms.path.packet(p);
        // since this.path is rooted to the base of the project, it's
        // impossible to get a document outside of the project this way.
        var searchPath = path.resolve(this.path(),p);
        if (searchPath === "/") {
            return cb(null,this._project.root());
        }
        var searchPacket = path.join(this._project.basePath(),searchPath);
        sfms.ps.readpacket(searchPacket,function(err,list) {
            if (err) {
                if (err.code && ((err.code === "ENOTDIR") || (err.code === "ENOENT"))) {
                    return cb(new StewError("Attempted to get a document that doesn't exist: " + searchPath,"NONEXISTING DOC"));
                }
                return cb(err);
            }
            // another way that the document might not exist.
            if (list.length === 0) {
                return cb(new StewError("Attempted to get a document that doesn't exist: " + searchPath,"NONEXISTING DOC"));
            }
            return cb(null,new ContentItem(this._project,searchPath));
        }.bind(this));
    }
    
}

var PathFunctions = module.exports.PathFunctions = function(prototype,baseSuffix) {
    baseSuffix = baseSuffix || "";
    
    prototype.path = function() {
        return this._path;
    }
    
    
    prototype.diskPath = function() {
        return path.join(this._project.basePath(),baseSuffix,this._path);
    }
    
    prototype.baseName = function() {
        return path.basename(this._path);
    }
}

var AccessPrimaries = module.exports.AccessPrimaries = function(prototype) {

    /**
     * ### *async* getPrimary(ext?)
     * 
     * Looks for a primary file, optionally with the specified extension.
     * Note that this returns an array, as multiple files could exist,
     * even if an extension is provided.
     * */
    prototype.getPrimaries = function(ext,cb) {
        if (typeof ext === "function") {
            cb = ext;
            ext = void 0;
        }
        sfms.ps.readpacket(this.diskPath(),"_",ext && ("." + ext),function(err,list) {
            if (err) {
                if (err.code && ((err.code === "ENOTDIR") || (err.code === "ENOENT"))) {
                    return cb(new StewError("Attempted to read a document that doesn't exist: " + this.diskPath(),"NONEXISTING DOC"));
                }
                return cb(err);
            }
            cb(null,list.filter(function(file) {
                // don't want directories here. That's gotten with content.
                return path.extname(file) !== "";
            }).map(function(file) {
                return path.join(path.dirname(this.diskPath()),file);
            }.bind(this)));
        }.bind(this));
    }
     
    /**
     * ### *async* ensurePrimary(ext)
     * 
     * Makes sure primary file is available for editing, creating one if necessary, because some editors don't work with a file
     * that doesn't exist. Need to specify extension on creation, or if more than one primary is found.
     * */
    prototype.ensurePrimary = function(ext,cb) {
        this._project.stew(function(err,stew) {
            if (err) {
                return cb(err);
            }
            this.getPrimaries(ext,function(err,list) {
                if (err) {
                    return cb(err);
                }
                // only check the default extension *now*. I don't
                // want it getting in the way of what the user specified,
                // or the extension of the base document.
                if (!ext) {
                    ext = stew.defaultDocExtension();
                    if ((list.length > 1) && (ext)) {
                        list = list.filter(function(file) {
                            return path.extname(file) === ("." + ext);
                        });
                    }
                }
                switch (list.length) {
                    case 0:
                        if (ext) {
                            return this._project.copyBlank(this.diskPath() + "." + ext,cb);
                        } else {
                            return cb(new StewError("Primary file can not be ensured without an extension.","CAN'T ENSURE PRIMARY"));
                        }
                    case 1:
                        return cb(null,list[0]);
                    default:
                        return cb(new StewError("Too many primary files to choose from.","TOO MANY PRIMARIES"));
                }
            }.bind(this));
        }.bind(this));
    }
}

/** 
 * ## Doc *class*
 * 
 * This is internal for now, since we can reach these through the StewProject
 * content function.
 * */
var Doc = module.exports.Doc = function(project,path) {
    this._project = project;
    this._path = path;
}

DirectoryIndex(Doc.prototype,Doc);

PathFunctions(Doc.prototype);

AccessPrimaries(Doc.prototype);

Doc.prototype.properties = function(cb) {
    this._project._propCache.readProperties(this.diskPath(),function(err,data) {
        if (err) {
            return cb(err);
        }
        this._project.stew(function(err,stew) {
            if (err) {
                return cb(err);
            }
            var write = this._project._propCache.saveProperties.bind(this._project._propCache,this.diskPath());
            return cb(null,new properties.DocProperties(this._project,data,stew,write));
        }.bind(this));
    }.bind(this));
}

attachments.Backups(Doc.prototype);
attachments.Notes(Doc.prototype);
attachments.Thumbnail(Doc.prototype);
attachments.Synopsis(Doc.prototype);
