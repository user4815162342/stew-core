var sfms = require("SFMS");
var StewError = require("./errors").StewError;
var fs = require('fs');
var path = require("path");
var ncp = require('ncp');
var Q = require('q');

var getAndEnsure = function(prototype,name,descriptor,stewDefault,blankPacket) {
    
    var get = "get" + name;
    prototype[get] = function(ext) {
        return Q.nbind(sfms.ps.readpacket,sfms.ps)(this.diskPath(),descriptor,ext && ("." + ext),blankPacket).then(function(list) {
            return list.map(function(file) {
                if (blankPacket) {
                    return path.join(this.diskPath(),file);
                } else {
                    return path.join(path.dirname(this.diskPath()),file);
                }
            }.bind(this));
        }.bind(this),function(err) {
            if (err.code && ((err.code === "ENOTDIR") || (err.code === "ENOENT"))) {
                throw new StewError("Attempted to read a document that doesn't exist.","NONEXISTING DOC");
            }
            throw err;
        }.bind(this));
    }
    
    var ensure = "ensure" + name;
    prototype[ensure] = function(ext) {
        return this._project.stew().then(function(stew) {
            return this[get](ext).then(function(list) {
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
                            return this._project.copyBlank(itemPath);
                        } else {
                            throw new StewError("Attachment can not be ensured without an extension.","CAN'T ENSURE ATTACHMENT");
                        }
                    case 1:
                        return list[0];
                    default:
                        throw new StewError("Too many attachment files to choose from.","TOO MANY ATTACHMENTS");
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
    prototype.getSynopsis = function() {
        return Q.nbind(sfms.ps.readpacket,sfms.ps)(this.diskPath(),"_synopsis",".txt").then(function(list) {
            if (list.length > 1) {
                throw new StewError("Too many synopsis files to choose from.","TOO MANY SYNOPSES");
            }
            return (list[0] ? path.join(path.dirname(this.diskPath()),list[0]) : void 0);
        }.bind(this),function(err) {
            if (err.code && ((err.code === "ENOTDIR") || (err.code === "ENOENT"))) {
                throw new StewError("Attempted to read a document that doesn't exist.","NONEXISTING DOC");
            }
            throw err;
        }.bind(this));
    }
    
    prototype.ensureSynopsis = function() {
        return this.getSynopsis().then(function(file) {
            if (typeof file === "undefined") {
                // No blank templates for synopses, just write the file.
                // no blank template found, so just write a blank file and hope it works.
                var itemPath = this.diskPath() + "_synopsis.txt";
                return Q.nbind(fs.writeFile,fs)(itemPath,"",{ encoding: 'utf8', flag: "wx" }).then(function() {
                    return itemPath;
                });
            } else {
                return file;
            }
        }.bind(this));
    }
    
    prototype.readSynopsis = function() {
        return this.getSynopsis().then(function(file) {
            if (typeof file === "undefined") {
                return "";
            } else {
                return Q.nbind(fs.readFile,fs)(file,{ encoding: 'utf8' });
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

var backupPrimaries = function(list,backupName) {
    if (list.length) {
        var primary = list.shift();
        var ext = path.extname(primary);
        var backup = backupName + path.extname(primary);
        // because ncp doesn't report an error if the file already exists...
        var q = Q.defer();
        // TODO: Use q-io. Can't just use Q.nbind here because exists isn't a normal node async.
        fs.exists(backup,function(exists) {
            if (!exists) {
                return q.resolve(Q.nbind(ncp)(primary,backupName + ext,{clobber: false}).then(function() {
                    return backupPrimaries(list,backupName);
                }));
            } else {
                return q.reject(new StewError("Backup already exists.","BACKUP EXISTS"));
            }
        });
        return q.promise;
    } else {
        // Nothing to backup, done...
        return Q.resolve();
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
    prototype.backupPrimary = function(ext,id) {
        if (!id) {
            id = timestamp();
        }
        // need the primaries...
        return this.getPrimaries(ext).then(function(list) {
            return backupPrimaries(list,this.diskPath() + "_backup-" + id);
        }.bind(this));
    }

    var backupMatch = /^_backup-([^.]*)$/
    // - getBackups (gets a list of backup files, sorted by 'id')
    prototype.getBackups = function(ext) {
        return Q.nbind(sfms.ps.readpacket,sfms.ps)(this.diskPath(),backupMatch,ext).then(function(list) {
            return list;
        },function(err) {
            if (err.code && ((err.code === "ENOTDIR") || (err.code === "ENOENT"))) {
                throw new StewError("Attempted to read a document that doesn't exist.","NONEXISTING DOC");
            }
            throw err;
        });
        
    }
}

