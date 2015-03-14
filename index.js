var fs = require('q-io/fs');
var path = require('path');
var StewError = require("./lib/errors").StewError;
var StewProject = require("./lib/StewProject");
var Q = require("q");

/*
 * Here is where the basic functionality is for manipulating a stew
 * project. The commands should be written with some assumptions:
 * - no current directory is known. Instead, use a "project" object
 * to do things.
 * 
 * The intention is that this core could potentially be used by 
 * a GUI form as well.
 * */

/**
 * # exports
 * 
 * ## project
 * 
 * ### *async* open(path *string*) *StewProject*
 * 
 * Looks for an existing stew project at the specified location.
 * If not found, travels up the directory until it finds one, changing
 * it's rootpath value as it does. If it never finds one, then it will
 * throw an error.
 * */
 var open = module.exports.open = function(p,dontSearch) {
     // NOTE: I expect to be given a full root. But that's somewhat
     // useless to check, so it's up to the user to ensure that.
     
     // now just look for _stew.json here, and if not found, keep
     // going up. until we find one.
     return fs.exists(path.join(p,"_stew.json")).then(function(exists) {
         if (!exists) {
             var dir = path.dirname(p);
             if ((dir === p) || (dontSearch)) {
                 // we've gone as far as we can.
                 throw new StewError("_stew.json file not found","STEW NOT FOUND")
             } else {
                 return open(dir,false);
             }
         } else {
             return new StewProject(p);
         }
     });
 }
 
/**
 * 
 * ### *async* init(path *string*) *StewProject*
 * 
 * Attempts to create a new stew project (by placing a _stew.json file)
 * out of the directory specified by path.
 * */
 var init = module.exports.init = function(p) {
     // NOTE: I expect to be given a full root. But that's somewhat
     // useless to check, so it's up to the user to ensure that.
     
     // first, attempt to open one up. I'm not creating one where
     // I've already got a stew.
     return open(p,false).then(function(project) {
         throw new StewError("This path is already in a stew project.","STEW ALREADY EXISTS");
     },function(err) {
         if (err && (err.code === "STEW NOT FOUND")) {
             // we can safely create one, right here.
             return fs.write(path.join(p,"_stew.json"),"{}",{encoding: 'utf8'}).then(function() {
                 return new StewProject(p);
             })
         } else {
             throw err;
         }
     });
 }
 
module.exports.StewError = StewError;
