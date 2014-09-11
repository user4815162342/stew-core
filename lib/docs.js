var path = require('path');
var mkdirp = require('mkdirp');
var sfms = require("SFMS");
var fs = require('fs');
var StewError = require("./errors.js").StewError;
var properties = require("./properties");
var attachments = require("./attachments");
var minimatch = require("minimatch");



var asyncForEach = function(array,task,cb) {
    if (array.length > 0) {
        var item = array.shift();
        task(item,function(err) {
            if (err) {
                return cb(err);
            }
            asyncForEach(array,task,cb);
        });
    } else {
        cb();
    }
}


/**
 * This is a mixin that allows the class to behave as a directory folder
 * containing Documents.
 * 
 * Requires this._project and this._path.
 * */
var DirectoryIndex = module.exports.DirectoryIndex = function(prototype,ContentItem,dontSort) {

    var filterItems = function(list,filter,cb) {
        var result = [];
        asyncForEach(list,function(doc,cb) {
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
                            process.nextTick(cb);
                        }
                    });
                } else {
                    // continue on with the next item in the list.
                    // in case everything is cached, we need to
                    // take an occasional break.
                    return process.nextTick(cb);
                }
            });
        },function(err) {
            if (err) {
                return cb(err);
            }
            cb(null,result);
        });
        
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
                        filterItems(list,options,cb);
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
    
    /**
     * Somewhere in between listDocs and getDoc. This function makes it
     * possible to find a list of docs, relative to another one, using
     * a glob pattern. This is a bit more efficient than listDocs for
     * finding specific documents, because it has optimizations to find
     * specific documents instead of walking through all docs. This
     * doesn't mean it won't still take a long time, depending on the
     * pattern.
     * 
     * The pattern is one of several possibilities:
     * - a string: a path pattern, will be resolved against the current document, 
     * then turned into a Minimatch object. Will return a list of any documents 
     * that should be able to match the pattern. 
     * - a Minimatch object: same thing, except the object is already parsed,
     * allowing you to specify more complex options.
     * - a RegEx: will return a list of files within the current doc that
     * match the RegEx pattern.
     * - minimatch.GLOBSTAR: Returns a recursive list of all documents
     * inside this one.
     * - an array of strings and RegEx's and minimatch.GLOBSTAR: 
     * Will take the first element off of the array. If it's a string, 
     * will call getDoc with that string, and then pass the remainder of 
     * the array to matchDocs on that doc. If it's a RegEx, will call 
     * matchDocs with that RegEx, then apply the remainder of the array 
     * to matchDocs of all returned children. If it's a GLOBSTAR, will 
     * get a recursive list of all documents, then check each document
     * to see if it matches.
     * */
    prototype.matchDocs = function(pattern,cb) {
        var results = [];
        if (typeof pattern === "string") {
            // then we need a Minimatch object.
            pattern = new minimatch.Minimatch(path.resolve(this.path(),pattern),{});
            // and match off of the root.
            return this._project.root().matchDocs(pattern,cb);
        }
        
        // Now, further processing is done based on the type of the object.
        if (pattern instanceof minimatch.Minimatch) {
            
            // If it's a Minimatch, then we just need to get the pattern
            // set off of it, and then match off of each of those. 
            // Minimatch can compile to a whole bunch of arrays, so
            // we can't just continue with this.
            var patternSet = pattern.set.slice(0);
            var results = [];
            
            return asyncForEach(patternSet,function(pattern,cb) {
                this.matchDocs(pattern,function(err,docs) {
                    if (err) {
                        return cb(err);
                    }
                    results = results.concat(docs);
                    return cb();
                });
            }.bind(this),function(err) {
                cb(err,results);
            })
            
        } else if (pattern instanceof Array) {
            
            if (pattern.length === 0) {
                return cb(null,[]);
            }
            
            // if it's an array, probably created as the set of patterns
            // from a Minimatch, then we process the first item, and
            // process the remaining parts of the array on the results.
            var patternItem = pattern[0];
            pattern = pattern.slice(1);
            
            if (typeof patternItem === "string") {
                
                // This just attempts to get the actual doc as a string.
                return this.getDoc(patternItem,function(err,doc) {
                    if (err) {
                        if (err.code && (err.code === "NONEXISTING DOC")) {
                            // no matching items were found, this is not an error, so...
                            return cb(null,[]);
                        }
                        return cb(err);
                    }
                    // we have a doc... If we've reached the end of the
                    // pattern, then that's it.
                    if (pattern.length === 0) {
                        return cb(null,[doc]);
                    } else {
                        // look for docs that match the rest of the pattern
                        // in the children.
                        return doc.matchDocs(pattern,cb);
                    }
                });
                
                
            } else if (patternItem instanceof RegExp) {
                
                // This is exactly the same as calling matchDocs with a RegExp
                // pattern, except we do something after.
                return this.matchDocs(patternItem,function(err,docs) {
                    if (err) {
                        return cb(err);
                    }
                    if (pattern.length === 0) {
                        return cb(null,docs);
                    } 
                    
                    var results = [];

                    return asyncForEach(docs,function(doc,cb) {
                        doc.matchDocs(pattern,function(err,docs) {
                            if (err) {
                                return cb(err);
                            }
                            results = results.concat(docs);
                            return matchEachDoc(docs,cb);
                        });
                    },function(err) {
                        return cb(err,results);
                    });
                    
                });
            } else if (patternItem === minimatch.GLOBSTAR) {
                
                // This is a bit more complicated. We basically
                // need to get all of the child docs and try to
                // match them. This is what matchDocs with a GLOBSTAR
                // will do anyway.
                return this.matchDocs(patternItem,function(err,docs) {
                    if (err) {
                        return cb(err);
                    }
                    // now, use minimatch to do the rest. matchone
                    // is an instance method, so we need an instance,
                    // even though it doesn't do anything else.
                    m = new minimatch.Minimatch("*");
                    // TODO: This one might not be working... I saw one
                    // error on this line about no method 'path', but
                    // didn't have time to reproduce it. Basically,
                    // try a search for "**/filename", that should be
                    // the simplest way to reproduce it.
                    m.matchOne(m.globParts(path.relative(this.path(),docs.path())),pattern,false);
                }.bind(this));
                
            }            
        } else if (pattern instanceof RegExp) {
            // basically, this is the same as a non-recursive listdocs
            // that matches the basename against the pattern.
            return this.listDocs(function(doc,cb) {
                return cb(null,pattern.test(doc.baseName()),false);
            },cb);
            
        } else if (pattern === minimatch.GLOBSTAR) {
            
            // basically, this is the same as a wildly recursive listDocs
            return this.listDocs(function(doc,cb) {
                return cb(null,true,true);
            },cb);
        }
        
        return cb(new StewError("Invalid Arguments To matchDocs: " + typeof pattern));
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
    
    prototype.rename = function(newName,cb) {
        if (this._path !== "/") {
            if (sfms.path.isTroublesome(newName) || (newName === "")) {
                return cb(new StewError("Attempted to rename a document to a troublesome name.","TROUBLESOME NAME"));
            }
            var newPath = path.join(path.dirname(this._path),newName);
            var newDiskPath = path.join(this._project.basePath(),baseSuffix,newPath);
            sfms.ps.rename(this.diskPath(),newDiskPath,function(err) {
                if (err) {
                    return cb(err);
                }
                this._path = newPath;
                return cb();
            }.bind(this));
        } else {
            return cb(new StewError("Can't rename root.","CANT RENAME ROOT"));
        }
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
