var path = require('path');
var mkdirp = require('mkdirp');
var sfms = require("SFMS");
var fs = require('fs');
var StewError = require("./errors.js").StewError;
var properties = require("./properties");
var attachments = require("./attachments");
var minimatch = require("minimatch");
var Q = require('q');



var promiseForEach = function(array,task) {
    if (array.length > 0) {
        var item = array.shift();
        return task(item).then(function() {
            return promiseForEach(array,task);
        });
    } else {
        return Q.resolve();
    }
}


/**
 * This is a mixin that allows the class to behave as a directory folder
 * containing Documents.
 * 
 * Requires this._project and this._path.
 * */
var DirectoryIndex = module.exports.DirectoryIndex = function(prototype,ContentItem,dontSort) {

    var filterItems = function(list,filter) {
        var result = [];
        return promiseForEach(list,function(doc) {
            // accept either a promise function or just the object
            // result, to make filters which only need to be synchronous
            // easier.
            return Q(filter(doc)).then(function(answer) {
                if ((answer === true) || answer.accept) {
                    result.push(doc);
                }
                if (answer.recurse) {
                    return doc.listDocs(filter).then(function(children) {
                        // add the results to the list.
                        result = result.concat(children);
                    });
                } else {
                    // continue on with the next item in the list.
                }
            });
        }).then(function() {
            return result;
        });        
    }
    
    var recursiveFilter = function(doc) {
        return {
            accept: true,
            recurse: true
        }
    }
    
    var nonRecursiveFilter = function(doc) {
        return {
            accept: true,
            recurse: false
        }
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
    prototype.listDocs = function(options) {
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
        // TODO: Switch over to q-io.
        return Q.nbind(fs.readdir,fs)(this.diskPath()).then(function(list) {
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
            
            var handleResults = function(list) {
                // our result needs to be mapped into Doc objects.
                list = list.map(function(path) {
                    return new ContentItem(this._project,path.slice(this._project.basePath().length));
                }.bind(this));
                return filterItems(list,options);
            }.bind(this);
            // and then, we need to sort
            if (!dontSort) {
                var sort = sfms.sort.sortByDirectoryProperty("index",true,this._project._propCache);
                // TODO: Move over to promises.
                return Q.nbind(sfms.sort.sortBy,sfms.sort)(list,sort).then(handleResults);
            } else {
                return handleResults(list);
            }
            
        }.bind(this),function(err) {
            if (err.code && ((err.code === "ENOTDIR") || (err.code === "ENOENT"))) {
                // not a directory, so return an empty list.
                return Q.resolve([]);
            }
            throw err;
            
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
    prototype.matchDocs = function(pattern) {
        var results = [];
        if (typeof pattern === "string") {
            // then we need a Minimatch object.
            pattern = new minimatch.Minimatch(path.resolve(this.path(),pattern),{});
            // and match off of the root.
            return this._project.root().matchDocs(pattern);
        }
        
        // Now, further processing is done based on the type of the object.
        if (pattern instanceof minimatch.Minimatch) {
            // If it's a Minimatch, then we just need to get the pattern
            // set off of it, and then match off of each of those. 
            // Minimatch can compile to a whole bunch of arrays, so
            // we can't just continue with this.
            var patternSet = pattern.set.slice(0);
            var results = [];
            
            return promiseForEach(patternSet,function(pattern) {
                return this.matchDocs(pattern).then(function(docs) {
                    results = results.concat(docs);
                });
            }.bind(this)).then(function() {
                return results;
            });
            
        } else if (pattern instanceof Array) {
            if (pattern.length === 0) {
                return Q.resolve([]);
            }
            
            // if it's an array, probably created as the set of patterns
            // from a Minimatch, then we process the first item, and
            // process the remaining parts of the array on the results.
            var patternItem = pattern[0];
            pattern = pattern.slice(1);
            
            if (typeof patternItem === "string") {
                
                // This just attempts to get the actual doc as a string.
                var result = this.getDoc(patternItem).then(function(doc) {
                    // we have a doc... If we've reached the end of the
                    // pattern, then that's it.
                    if (pattern.length === 0) {
                        return Q.resolve([doc]);
                    } else {
                        // look for docs that match the rest of the pattern
                        // in the children.
                        return doc.matchDocs(pattern);
                    }
                },function(err) {
                    if (err.code && (err.code === "NONEXISTING DOC")) {
                        // no matching items were found, this is not an error, so...
                        return Q.resolve([]);
                    }
                    return Q.reject(err);
                });
                result.then(function(result) {
                    return result;
                });
                return result;
                
                
            } else if (patternItem instanceof RegExp) {

debugger;                
                // This is exactly the same as calling matchDocs with a RegExp
                // pattern, except we do something after.
                return this.matchDocs(patternItem).then(function(docs) {
                    if (pattern.length === 0) {
                        return Q.resolve(docs);
                    } 
                    
                    var results = [];
                    
                    return promiseForEach(docs,function(doc) {
                        return doc.matchDocs(pattern).then(function(docs) {
                            results = results.concat(docs);
                        });
                    }.bind(this)).then(function() {
                        return results;
                    });
                });
            } else if (patternItem === minimatch.GLOBSTAR) {

                // This is a bit more complicated. We basically
                // need to get all of the child docs and try to
                // match them. This is what matchDocs with a GLOBSTAR
                // will do anyway.
                return this.matchDocs(patternItem).then(function(docs) {
                    // now, use minimatch to do the rest. matchone
                    // is an instance method, so we need an instance,
                    // even though it doesn't do anything else.
                    m = new minimatch.Minimatch("*");
                    return q.resolve(docs.filter(function(doc) {
                        var docPath = path.relative(this.diskPath(),doc.diskPath()).split(/\/+/);
                        return m.matchOne(docPath,[patternItem].concat(pattern),false);
                    }.bind(this)));
                }.bind(this));
                
            }            
        } else if (pattern instanceof RegExp) {
            // basically, this is the same as a non-recursive listdocs
            // that matches the basename against the pattern.
            return this.listDocs(function(doc) {
                return {
                    accept: pattern.test(doc.baseName())
                }
            }).then(function(result) {
                return result;
            })
            
        } else if (pattern === minimatch.GLOBSTAR) {
            // basically, this is the same as a wildly recursive listDocs
            return this.listDocs(function(doc) {
                return { accept: true, recurse: true };
            });
        }
        
        return Q.reject(new StewError("Invalid Arguments To matchDocs: " + typeof pattern));
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
    prototype.addDoc = function(name) {
        // since this.path is rooted to the base of the project, it's impossible
        // to add a relative doc by using '..' in the name.
        var newDocPath = path.resolve(this.path(),name);
        if (isPathTroublesome(newDocPath)) {
            return Q.reject(new StewError("Attempted to create a document with a troublesome name.","TROUBLESOME NAME"));
        }
        var newPacket = path.join(this._project.basePath(),newDocPath);
        // need to ensure the directory exists.
        var q = Q.defer();
        // TODO: Switch over to q-io
        mkdirp(path.dirname(newPacket),function(err) {
            if (err) {
                return q.reject(err);
            }
            // else create the properties file so there's something there.
            // 'wx' flag should fail if the file already exists.
            fs.writeFile(newPacket + "_properties.json","{}",{ encoding: 'utf8', flag: "wx"},function(err) {
                if (err) {
                    if (err.code && (err.code === "EEXIST")) {
                        return q.reject(new StewError("Attempted to add a document that already exists.","EXISTING DOC"));
                    }
                    return q.reject(err);
                }
                return q.resolve(new ContentItem(this._project,newDocPath));
            });
        });
        return q.promise;
    }
    
    /**
     * ### *async* get(path) *Doc*
     * 
     * Attempts to find a Doc relative to this doc.
     * */
    prototype.getDoc = function(p) {
        // We only want to get the actual packet. If the user tried to
        // trick us by passing in a filename (or, more likely, if this was automatically
        // provided by a globbing at the command line) than we just want the
        // packet.
        p = sfms.path.packet(p);
        // since this.path is rooted to the base of the project, it's
        // impossible to get a document outside of the project this way.
        var searchPath = path.resolve(this.path(),p);
        if (searchPath === "/") {
            return Q.resolve(this._project.root());
        }
        var searchPacket = path.join(this._project.basePath(),searchPath);
        return Q.nbind(sfms.ps.readpacket,sfms.ps)(searchPacket).then(function(list) {
            // another way that the document might not exist.
            if (list.length === 0) {
                throw new StewError("Attempted to get a document that doesn't exist: " + searchPath,"NONEXISTING DOC");
            }
            return new ContentItem(this._project,searchPath);
        }.bind(this),function(err) {
            if (err.code && ((err.code === "ENOTDIR") || (err.code === "ENOENT"))) {
                throw new StewError("Attempted to get a document that doesn't exist: " + searchPath,"NONEXISTING DOC");
            }
            throw err;
        }.bind(this));
    }
    
    /** 
     * ### *async* moveDocTo(Doc) *Doc*
     * 
     * Renames the path of the passed doc so that it becomes a child of this document.
     * The parameter must be a valid doc (or at least support Path Functions).
     * */
    prototype.moveDocHere = function(doc) {
        // since this.path is rooted to the base of the project, it's impossible
        // to add a relative doc by using '..' in the name.
        if (doc.path() !== "/") {
            if (doc.path() !== this.path()) {
                var oldDiskPath = doc.diskPath();
                var newPath = path.join(this.path(),doc.baseName());
                var newDiskPath = path.join(this.diskPath(),doc.baseName());
                
                // need to ensure the directory exists, in case this document hasn't had any children added yet.
                var q = Q.defer();
                // TODO: Switch to q-io
                mkdirp(path.dirname(newDiskPath),function(err) {
                    if (err) {
                        return q.reject(err);
                    }
                    sfms.ps.rename(oldDiskPath,newDiskPath,function(err) {
                        if (err) {
                            return q.reject(err);
                        }
                        doc._path = newPath;
                        return q.resolve();
                    }.bind(this));
                });
                return q.promise;
            } else {
                return Q.reject(new StewError("Can't move into self.","CANT MOVE RECURSIVE"));
            }
        } else {
            return Q.reject(new StewError("Can't move root.","CANT MOVE ROOT"));
        }
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
    
    prototype.rename = function(newName) {
        if (this._path !== "/") {
            if (sfms.path.isTroublesome(newName) || (newName === "")) {
                return Q.reject(new StewError("Attempted to rename a document to a troublesome name.","TROUBLESOME NAME"));
            }
            var newPath = path.join(path.dirname(this._path),newName);
            var newDiskPath = path.join(this._project.basePath(),baseSuffix,newPath);
            // TODO: Switch to promise
            return Q.nbind(sfms.ps.rename,sfms.ps)(this.diskPath(),newDiskPath).then(function() {
                this._path = newPath;
            }.bind(this));
        } else {
            return Q.reject(new StewError("Can't rename root.","CANT RENAME ROOT"));
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
    prototype.getPrimaries = function(ext) {
        return Q.nbind(sfms.ps.readpacket,sfms.ps)(this.diskPath(),"_",ext && ("." + ext)).then(function(list) {
            return list.filter(function(file) {
                // don't want directories here. That's gotten with content.
                return path.extname(file) !== "";
            }).map(function(file) {
                return path.join(path.dirname(this.diskPath()),file);
            }.bind(this));
        }.bind(this),function(err) {
            if (err.code && ((err.code === "ENOTDIR") || (err.code === "ENOENT"))) {
                throw new StewError("Attempted to read a document that doesn't exist: " + this.diskPath(),"NONEXISTING DOC");
            }
            throw err;
        }.bind(this));
    }
     
    /**
     * ### *async* ensurePrimary(ext)
     * 
     * Makes sure primary file is available for editing, creating one if necessary, because some editors don't work with a file
     * that doesn't exist. Need to specify extension on creation, or if more than one primary is found.
     * */
    prototype.ensurePrimary = function(ext) {
        return this._project.stew().then(function(stew) {
            return this.getPrimaries(ext).then(function(list) {
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
                            return this._project.copyBlank(this.diskPath() + "." + ext)
                        } else {
                            throw new StewError("Primary file can not be ensured without an extension.","CAN'T ENSURE PRIMARY");
                        }
                    case 1:
                        return list[0];
                    default:
                        throw new StewError("Too many primary files to choose from.","TOO MANY PRIMARIES");
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

Doc.prototype.properties = function() {
    // TODO: Switch to a promise (this is defined in sfms)
    return Q.nbind(this._project._propCache.readProperties,this._project._propCache)(this.diskPath()).then(function(data) {
        return this._project.stew().then(function(stew) {
            var write = Q.nbind(this._project._propCache.saveProperties.bind(this._project._propCache,this.diskPath()));
            return new properties.DocProperties(this._project,data,stew,write);
        }.bind(this))
    }.bind(this));
}

attachments.Backups(Doc.prototype);
attachments.Notes(Doc.prototype);
attachments.Thumbnail(Doc.prototype);
attachments.Synopsis(Doc.prototype);
