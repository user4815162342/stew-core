var StewError = require("./errors").StewError;
var Q = require('q');

/**
 * Each different Properties class is basically the same thing with
 * different functionality mixed into the prototype. Each mixin has
 * certain requirements that the constructor must set.
 * */



/**
 * Provides a simple way to create a basic get function in the
 * mixins for a read-only property.
 * 
 * Requires object to have a this._data.
 * */
var get = function(name,defalt,transform) {
    transform = transform || function(v) { return v; }
    return function() {
        if (this._data.hasOwnProperty(name)) {
            return transform.bind(this)(this._data[name]);
        } else {
            return defalt;
        }
    }
}

var defaultFunction = function(v) {
    if (typeof v === "function") {
        return v;
    } else {
        return function() {
            return v;
        }
    }
}

var transformInFunction = function(f) {
    if (typeof f === "function") {
        return f;
    }
    if (typeof f === "string") {
        return function(v) {
            if (typeof v !== f) {
                throw new StewError("Invalid value for property.","INVALID PROP VALUE");
            }
            return v;
        }
    }
    return function(v) {
        return v;
    }
}

/** 
 * Provides a simple way to create a basic 'get' or 'set' function.
 * 
 * Requires the object to have this._data.
 * */
var getOrSet = function(name,defalt,transformIn,transformOut) {
    defalt = defaultFunction(defalt);
    transformIn = transformInFunction(transformIn);
    transformOut = transformOut || function(v) { return v;}
    return function(value) {
        if (arguments.length === 0) {
            // get
            if (this._data.hasOwnProperty(name)) {
                return transformOut.bind(this)(this._data[name]);
            } else {
                return defalt.bind(this)();
            }
        } else {
            // set
            if (typeof value === "undefined") {
                delete this._data[name];
            } else {
                this._data[name] = transformIn.bind(this)(value);
            }
        }
    }
}

/**
 * Generic mixin generator to allow access to a mapped object property.
 * 
 * Name supplied should have a capital first letter. The prop name will be generated
 * as lower case.
 * 
 * The prototype is the prototype to apply the method to.
 * 
 * The name is the singular title of the property's values, capitalized (i.e. "Category"),
 * for use in getting function names.
 * The propName is the name of the property itself, which is also used
 * in one function name.
 * 
 * The transform is a function which is used to transform the stored
 * data into something that can be edited.
 * */
var mappedProperties = function(prototype,name,propName,transform) {

    transform = transform || function(v) { return v; }
        
    prototype[propName] = function() {
        if (this._data.hasOwnProperty(propName)) {
            return Object.keys(this._data[propName]);
        } else {
            return defalt;
        }
    }
    
    var has = "has" + name;
    prototype[has] = function(key) {
        return (this._data.hasOwnProperty(propName) && (this._data[propName].hasOwnProperty(key)));
    }
    
    var get = "get" + name;
    prototype[get] = function(key) {
        if (this[has](key)) {
            return transform(this._data[propName][key]);
        }
    }
    
    var add = "add" + name;
    prototype[add] = function(key) {
        if (!this[has](key)) {
            if (!this._data.hasOwnProperty(propName)) {
                this._data[propName] = {};
            }
            this._data[propName][key] = {};
        }
        return this[get](key);
    }
    
    var remove = "remove" + name;
    prototype[remove] = function(key) {
        if (this[has](key)) {
            delete this._data[propName][key];
        }
    }

}

var stringArrayProperty = function(prototype,name,propName,add,remove) {
    
    prototype[propName] = function() {
        if (this._data.hasOwnProperty(propName)) {
            return this._data[propName].slice(0);
        } else {
            return [];
        }
    }

    var indexOf = "indexOf" + name;
    prototype[indexOf] = function(value) {
        if (this._data.hasOwnProperty(propName)) {
            return this._data[propName].indexOf(value);
        }
        return -1;
    }
    
    add = add || ("add" + name);
    prototype[add] = function(value) {
        this[order](value,"last");
    }
    
    remove = remove || ("remove" + name);
    prototype[remove] = function(value) {
        var index = this[indexOf](value);
        if (index > -1) {
            this._data[propName].splice(index,1);
        }
    }
    
    var order = "order" + name;
    prototype[order] = function(value,position,relativeTo) {
        if (!this._data.hasOwnProperty(propName)) {
            // we already know it's not in here, so just
            // add it, the only possible position is the lone status.
            this._data[propName] = [ value ];
        } else {
            // find the old value and remove it.
            var oldIndex = this._data[propName].indexOf(value);
            if (oldIndex > -1) {
                this._data[propName].splice(oldIndex,1);
            }
            var inc = 0;
            if (typeof position === "string") {
                switch (position) {
                    case "first":
                        position = 0;
                        break;
                    case "last":
                        position = this._data[propName].length;
                        break;
                    case "next":
                        position = oldIndex + 1;
                        break;
                    case "previous":
                        position = oldIndex - 1;
                        break;
                    case "after":
                        inc = 1;
                    case "before":
                        position = this._data[propName].indexOf(relativeTo);
                        if (position === -1) {
                            // always add it to the end. (We've already
                            // removed it, so we definitely have to put
                            // it there.
                            // In any case, if something doesn't exist,
                            // it should appear to sort to the end, so
                            // before or after a non-existent should also
                            // be at the end.
                            position = this._data[propName].length;
                        }
                        position += inc;
                        break;
                }
            }
            this._data[propName].splice(position,0,value);
        }
    }
}

    
/**
 * Mix to allow access to unmanaged properties using 'get' and 'set'.
 * 
 * Requires only this._data to be declared by the constructor.
 * 
 * */
var UnmanagedProperties = function(prototype,managed) {
    /**
     * ### get(name) *any*
     * 
     * Retrieves a property value by name.
     * */
    prototype.get = function(name) {
        if ((managed.indexOf(name) === -1) && (this._data.hasOwnProperty(name))) {
            return this._data[name];
        }
            
    }
    
    /**
     * ### set(name,value *any*)
     * 
     * Sets a property value. The value should be JSON-compatible.
     * */
    prototype.set = function(name,value) {
        if ((managed.indexOf(name) === -1)) {
            if (typeof value === "undefined") {
                delete this._data[name];
            } else {
                this._data[name] = value;
            }
        }
    }    
}

/**
 * Mix to allow access to a 'user' scope.
 * */
var UserProperty = function(prototype,managed) {
    managed.push("user");
    
    prototype.user = function() {
        if (!this._data.hasOwnProperty("user")) {
            this._data.user = {};
        }
        return new UserProperties(this._data.user);
    }
}

/**
 * Mix to allow saving of properties.
 * 
 * Requires this._data and a this._write function to be called with
 * that data.
 * */
var SaveProperties = function(prototype,managed) {
    
    prototype.save = function() {
        return this._write(this._data)
    }
    
}

/**
 * Allows specifying default file extensions for different types of documents
 * in the stew properties.
 * */
var DefaultFileExtensions = function(prototype,managed) {
    managed.push("defaultDocExtension");
    managed.push("defaultThumbnailExtension");
    managed.push("defaultNotesExtension");
    
    prototype.defaultDocExtension = getOrSet("defaultDocExtension",void 0,"string");
    prototype.defaultThumbnailExtension = getOrSet("defaultThumbnailExtension",void 0,"string");
    prototype.defaultNotesExtension = getOrSet("defaultNotesExtension",void 0,"string");
}

/**
 * A mixin to be added to properties to allow access to category definitions
 * on the stew file.
 * 
 * Requires this._data.
 * */
var CategoryDefinitions = function(prototype,managed) {
    managed.push("categories")
    managed.push("defaultCategory");
        
    mappedProperties(prototype,"Category","categories",function(data) {
        return new CategoryDefinition(data);
    });
    
    prototype.defaultCategory = getOrSet("defaultCategory",void 0,"string");
    
}


/**
 * A mixin to be added to properties to allow access to status definitions
 * on the stew file.
 * 
 * Requires this._data.
 * */
var StatusDefinitions = function(prototype,managed) {
    managed.push("statuses")
    managed.push("defaultStatus");
    
    stringArrayProperty(prototype,"Status","statuses",true);

    prototype.defaultStatus = getOrSet("defaultStatus",void 0,"string");
    
}

/**
 * Allows getting and editing the 'editors' option in Stew.
 * */
var Editors = function(prototype,managed) {
    managed.push("editors");
    
    prototype.editor = function(mimeType,command) {
        if (arguments.length === 1) {
            if (this._data.hasOwnProperty("editors")) {
                if (this._data.editors.hasOwnProperty(mimeType)) {
                    return this._data.editors[mimeType];
                }
            } 
        } else if (arguments.length === 2) {
            if (!this._data.hasOwnProperty("editors")) {
                this._data.editors = {};
            } 
            if (typeof command === "undefined") {
                delete this._data.editors[mimeType];
            } else {
                this._data.editors[mimeType] = command;
            }
        }
    }
}

/**
 * Access to a color property
 * 
 * Requires this._data.
 * */
var ColorProperty = function(prototype,managed) {
    managed.push("color");
    
    var dereferenceColor = function(color) {
        return {
            r: color.r,
            g: color.g,
            b: color.b
        }
    }
    
    prototype.color = getOrSet("color",void 0,dereferenceColor,dereferenceColor);
    
}

/**
 * Access to a directory index
 * 
 * Requieres this._data.
 * */
var DirectoryIndex = function(prototype,managed) {
    managed.push("index");
    
    stringArrayProperty(prototype,"Doc","index",true,"addToIndex","removeFromIndex");
    
}

/**
 * Access to a document's status.
 * 
 * Requires this._data and this._stew (a reference to the 
 * Stew Properties for the project)
 * */
var Status = function(prototype,managed) {
    managed.push("status");
    
    prototype.status = getOrSet("status",function() {
        return this._stew.defaultStatus();
    },"string");
    
    var changeStatus = function(delta) {
        return function() {
            var status = this.status();
            var statuses = this._stew.statuses();
            var idx = statuses.indexOf(status);
            idx += delta;
            if ((idx >= 0) && (idx < (statuses.length))) {
                this.status(statuses[idx]);
            }
        }
    }
    
    prototype.incStatus = changeStatus(1);
    
    prototype.decStatus = changeStatus(-1);
    
}

/**
 * Access to a document's status.
 * 
 * Requires this._data and this._stew (a reference to the 
 * Stew Properties for the project)
 * */
var Category = function(prototype,managed) {
    managed.push("category");

    prototype.category = getOrSet("category",function() {
        return this._stew.defaultCategory();
    },"string");
    

}

/**
 * Access to the 'publish' property.
 * */
var Publish = function(prototype,managed) {
    managed.push("publish");
    
    prototype.publish = getOrSet("publish",false,"boolean");
}

/**
 * Access to the References property.
 * */
var References = function(prototype,managed) {
    managed.push("references");
    
    
    // Unfortunately, this works a little different than the string
    // array and the object map.
    prototype.references = get("references",[],function(list) {
        return list.map(function(reference) {
            return new Reference(reference,this._project);
        }.bind(this));
    });
    
    prototype.getReferencesTo = function(doc) {
        if (this._data.hasOwnProperty("references")) {
            return this._data.references.filter(function(reference) {
                if (reference.file && (reference.file === doc.path())) {
                    return true;
                }
                return false;
            }).map(function(reference) {
                return new Reference(reference,this._project);
            })
        } else {
            return [];
        }
    }
    
    prototype.addReferenceTo = function(doc,title) {
        if (doc._project !== this._project) {
            throw new StewError("Attempted to add reference to document outside of stew project.","OUTSIDE REFERENCE");
        }
        if (!this._data.hasOwnProperty("references")) {
            this._data.references = [];
        }
        this._data.references.push({
            file: doc.path(),
            title: title || doc.baseName()
        });
    }
    
    prototype.removeReferencesTo = function(doc) {
        if (this._data.hasOwnProperty("references")) {
            var newReferences = [];
            this._data.references.forEach(function(reference) {
                if ((!reference.file) || (reference.file !== doc.path())) {
                    newReferences.push(reference);
                }
            })
            this._data.references = newReferences;
        } 
    }
    
}

var ReferenceProperties = function(prototype,managed) {
    managed.push("title");
    managed.push("url");
    managed.push("file");
    
    prototype.title = getOrSet("title",void 0,"string");
    
    prototype.url = get("url");
    
    prototype.doc = get("file",void 0,function(v) {
        // need to do the require here because circular reference.
        var result = new (require("./docs").Doc)(this._project,v);
        return result;
    });

}

var Tags = function(prototype,managed) {
    managed.push("tags");    
    
    // This works a little different than string array, as we
    // don't have any implied order for tags.
    
    prototype.tags = get("tags",[],function(data) {
        return data.slice(0);
    });
    
    prototype.hasTag = function(value) {
        if (this._data.hasOwnProperty("tags")) {
            return this._data.tags.indexOf(value) > -1;
        }
        return false;
    }
    
    prototype.addTag = function(value) {
        if (!this.hasTag(value)) {
            if (!this._data.hasOwnProperty("tags")) {
                this._data.tags = [value];
            } else {
                this._data.tags.push(value);
            }
        }
    }
    
    prototype.removeTag = function(value) {
        if (this._data.hasOwnProperty("tags")) {
            var index = this._data.tags.indexOf(value);
            if (index > -1) {
                this._data.tags.splice(index,1);
            }
        }
    }
}

/**
 * A simple mixing function to mix in functionality to properties
 * and allow the mixins to specify which properties are managed.
 * */
var mix = function(constructor,mixins) {
    var managedProperties = [];
    mixins.forEach(function(mixin) {
        mixin(constructor.prototype,managedProperties);
    });
    return constructor;
}

/**
 * Various Properties Classes and Mixins that support them.
 * */
 
 /**
  * Returns properties associated with the _stew.json file in the
  * project root.
  * */
var StewProperties = module.exports.StewProperties = mix(function(data,write) {
    this._data = data;
    this._write = write;
},[
    UnmanagedProperties,
    UserProperty,
    SaveProperties,
    CategoryDefinitions,
    StatusDefinitions,
    Editors,
    DefaultFileExtensions
]);

var ProjectRootProperties = module.exports.ProjectRootProperties = mix(function(data,write) {
    this._data = data;
    this._write = write;
},[
    UnmanagedProperties,
    UserProperty,
    SaveProperties,
    DirectoryIndex
]);

var DocProperties = module.exports.DocProperties = mix(function(project,data,stew,write) {
    this._project = project;
    this._data = data;
    this._stew = stew;
    this._write = write;
},[
    UnmanagedProperties,
    UserProperty,
    SaveProperties,
    DirectoryIndex,
    Status,
    Category,
    Publish,
    References,
    Tags
]);

var TagProperties = module.exports.TagProperties = mix(function(data,write) {
    this._data = data;
    this._write = write;
},[
    UnmanagedProperties,
    UserProperty,
    SaveProperties,
    ColorProperty
]);

/**
 * Used internally to create an object which can edit the CategoryDefinitions.
 * */
var CategoryDefinition = mix(function(data) {
    this._data = data;
},[
    UnmanagedProperties,
    UserProperty,
    ColorProperty
]);

/**
 * Used internally for references.
 * */
var Reference = mix(function(data,project) {
    this._data = data;
    this._project = project;
},[
    UnmanagedProperties,
    UserProperty,
    ReferenceProperties
]);

var UserProperties = mix(function(data) {
    this._data = data;
},[
    UnmanagedProperties
]);
