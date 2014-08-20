var sfms = require("SFMS");
var StewError = require("./errors").StewError;
var fs = require('fs');
var path = require("path");
var ncp = require('ncp');

var getAndEnsure = function(prototype,name,descriptor,stewDefault,blankPacket) {
    
    var get = "get" + name;
    prototype[get] = function(ext,cb) {
        if (typeof ext === "function") {
            cb = ext;
            ext = void 0;
        }
        sfms.ps.readpacket(this.diskPath(),descriptor,ext && ("." + ext),blankPacket,function(err,list) {
            if (err) {
                if (err.code && ((err.code === "ENOTDIR") || (err.code === "ENOENT"))) {
                    return cb(new StewError("Attempted to read a document that doesn't exist.","NONEXISTING DOC"));
                }
                return cb(err);
            }
            return cb(null,list.map(function(file) {
                if (blankPacket) {
                    return path.join(this.diskPath(),file);
                } else {
                    return path.join(path.dirname(this.diskPath()),file);
                }
            }.bind(this)));
        }.bind(this));
    }
    
    var ensure = "ensure" + name;
    prototype[ensure] = function(ext,cb) {
        this._project.stew(function(err,stew) {
            if (err) {
                return cb(err);
            }
            this[get](ext,function(err,list) {
                if (err) {
                    return cb(err);
                }
                if (!ext) {
                    ext = stew[stewDefault]();
                    if ((list.length > 1) && (ext)) {
                        list = list.filter(function(file) {
                            return path.extname(file) === ("." + ext);
                        });
                    }
                }
                switch (list.length) {
                    case 0:
                        if (ext) {
                            if (blankPacket) {
                                itemPath = path.join(this.diskPath(),descriptor + "." + ext);
                            } else {
                                itemPath = this.diskPath() + descriptor + "." + ext;
                            }
                            return this._project.copyBlank(itemPath,cb);
                        } else {
                            return cb(new StewError("Attachment can not be ensured without an extension.","CAN'T ENSURE ATTACHMENT"));
                        }
                    case 1:
                        return cb(null,list[0]);
                    default:
                        return cb(new StewError("Too many attachment files to choose from.","TOO MANY ATTACHMENTS"));
                }
            }.bind(this));
        }.bind(this));
    }
    
}

// FUTURE: Need to be able to support these... In some cases, it's
// basically a matter of listing the files, sometimes it's a matter
// of ensuring the file exists.
module.exports.Notes = function(prototype,blankPacket) {
    // <this._path>_notes.<ext> or <this._path>/_note.<ext>
    getAndEnsure(prototype,"Notes","_notes","defaultNotesExtension",blankPacket);
}

module.exports.Thumbnail = function(prototype) {
    // <this._path>_thumbnail.<ext>
    getAndEnsure(prototype,"Thumbnail","_thumbnail","defaultThumbnailExtension");
}

module.exports.Synopsis = function(prototype) {
    // <this._path>_synopsis.txt
    // - ensureSynopsis (similar to ensurePrimary, no extension required)
    // - getSynopsis (similar to getPrimaries, but only one can be returned)
    // - readSynopsis (reads the text of the synopsis and returns it)
    prototype.getSynopsis = function(cb) {
        sfms.ps.readpacket(this.diskPath(),"_synopsis",".txt",function(err,list) {
            if (err) {
                if (err.code && ((err.code === "ENOTDIR") || (err.code === "ENOENT"))) {
                    return cb(new StewError("Attempted to read a document that doesn't exist.","NONEXISTING DOC"));
                }
                return cb(err);
            }
            if (list.length > 1) {
                return cb(new StewError("Too many synopsis files to choose from.","TOO MANY SYNOPSES"));
            }
            return cb(null,list[0] ? path.join(path.dirname(this.diskPath()),list[0]) : void 0);
        }.bind(this));
    }
    
    prototype.ensureSynopsis = function(cb) {
        this.getSynopsis(function(err,file) {
            if (err) {
                return cb(err);
            }
            if (typeof file === "undefined") {
                // No blank templates for synopses, just write the file.
                // no blank template found, so just write a blank file and hope it works.
                var itemPath = this.diskPath() + "_synopsis.txt";
                return fs.writeFile(itemPath,"",{ encoding: 'utf8', flag: "wx" },function(err) {
                    cb(err,itemPath);
                });
            } else {
                return cb(null,file);
            }
        }.bind(this));
    }
    
    prototype.readSynopsis = function(cb) {
        this.getSynopsis(function(err,file) {
            if (err) {
                return cb(err);
            }
            if (typeof file === "undefined") {
                return cb(null,"");
            } else {
                fs.readFile(file,{ encoding: 'utf8' },cb);
            }
        });
    }
}

var pad = function(num) {
    norm = Math.abs(Math.floor(num));
    return (norm < 10 ? '0' : '') + norm;
}

var timestamp = function() {
    // from http://stackoverflow.com/a/17415677/300213
    // with modifications to get something that looks like this:
    //`backup-2006-08-23-19-33-44.456+0000.rtf` (since colons are not good names,
    // and I want milliseconds).
    var local = new Date();
    var tzo = -local.getTimezoneOffset();
    var sign = tzo >= 0 ? '+' : '-';
    return local.getFullYear() 
        + '-' + pad(local.getMonth()+1)
        + '-' + pad(local.getDate())
        + '-' + pad(local.getHours())
        + '-' + pad(local.getMinutes()) 
        + '-' + pad(local.getSeconds()) 
        + '.' + String( (local.getMilliseconds()/1000).toFixed(3) ).slice( 2, 5 )
        + sign + pad(tzo / 60) 
        + ':' + pad(tzo % 60);
}

var backupPrimaries = function(list,backupName,cb) {
    if (list.length) {
        var primary = list.shift();
        var ext = path.extname(primary);
        var backup = backupName + path.extname(primary);
        // because ncp doesn't report an error if the file already exists...
        fs.exists(backup,function(exists) {
            if (!exists) {
                ncp(primary,backupName + ext,{clobber: false},function(err) {
                    if (err) {
                        return cb(err);
                    }
                    backupPrimaries(list,backupName,cb);
                });
            } else {
                return cb(new StewError("Backup already exists.","BACKUP EXISTS"));
            }
        });
    } else {
        // Nothing to backup, done...
        cb();
    }
}

/**
 * Adds backup primaries commands.
 * 
 * Requires this.diskPath, this.getPrimaries
 * */
module.exports.Backups = function(prototype) {
    // <this._path>_backup-<id>.<ext>

    /**
     * ### *async* backup(string?)
     * 
     * Creates a backup of the primary file as an attachment named
     * `<filename>_backup-<id>.<ext>` or `<filename>_backup-<timestamp>.<ext>`
     * 
     * */
    prototype.backupPrimary = function(ext,id,cb) {
        if (typeof ext === "function") {
            cb = ext;
            ext = void 0;
            id = timestamp();
        } else if (typeof id === "function") {
            cb = id;
            id = timestamp();
        } else if (!id) {
            id = timestamp();
        }
        // need the primaries...
        this.getPrimaries(ext,function(err,list) {
            if (err) {
                return cb(err);
            }
            backupPrimaries(list,this.diskPath() + "_backup-" + id,cb);
            
        }.bind(this));
    }

    var backupMatch = /^_backup-([^.]*)$/
    // - getBackups (gets a list of backup files, sorted by 'id')
    prototype.getBackups = function(ext,cb) {
        if (typeof ext === "function") {
            cb = ext;
            ext = void 0;
        }
        sfms.ps.readpacket(this.diskPath(),backupMatch,ext,function(err,list) {
            if (err) {
                if (err.code && ((err.code === "ENOTDIR") || (err.code === "ENOENT"))) {
                    return cb(new StewError("Attempted to read a document that doesn't exist.","NONEXISTING DOC"));
                }
                return cb(err);
            }
            cb(null,list);
        });
        
    }
}

