var docs = require("./docs");


var Tag = function(project,path) {
    this._project = project;
    this._path = path;
}

docs.DirectoryIndex(Tag.prototype,Tag,true);

docs.AccessPrimaries(Tag.prototype);

docs.PathFunctions(Tag.prototype,"_tags");

Tag.prototype.properties = function() {
    // TODO: Convert to promises.
    return Q.nbind(this._propCache.readProperties,this._propCache)(this._packet).then(function(data) {
        var write = Q.nbind(this._project._propCache.saveProperties.bind(this._propCache,this._path));
        return new properties.TagProperties(data,write);
    }.bind(this));
}

// No attachments for Tags.
 
var TagContent = module.exports.TagContent = function(project,path) {
    this._project = project;
    this._path = path;
}

docs.DirectoryIndex(TagContent.prototype,Tag,true);

