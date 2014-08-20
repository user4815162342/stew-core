var fs = require('fs');
var path = require('path');
var StewError = require("./lib/errors").StewError;
var StewProject = require("./lib/StewProject");

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
 var open = module.exports.open = function(p,dontSearch,cb) {
     // NOTE: I expect to be given a full root. But that's somewhat
     // useless to check, so it's up to the user to ensure that.
     
     // now just look for _stew.json here, and if not found, keep
     // going up. until we find one.
     fs.exists(path.join(p,"_stew.json"),function(exists) {
         if (!exists) {
             var dir = path.dirname(p);
             if ((dir === p) || (dontSearch)) {
                 // we've gone as far as we can.
                 return cb(new StewError("_stew.json file not found","STEW NOT FOUND"))
             } else {
                 return open(dir,false,cb);
             }
         } else {
             return cb(null, new StewProject(p));
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
 var init = module.exports.init = function(p,cb) {
     // NOTE: I expect to be given a full root. But that's somewhat
     // useless to check, so it's up to the user to ensure that.
     
     // first, attempt to open one up. I'm not creating one where
     // I've already got a stew.
     open(p,false,function(err,value) {
         if (err && (err.code === "STEW NOT FOUND")) {
             // we can safely create one, right here.
             fs.writeFile(path.join(p,"_stew.json"),"{}",{encoding: 'utf8'},function(err) {
                 if (err) {
                     return cb(err) 
                 } else {
                     return cb(null, new StewProject(p));
                 }
             });
         } else if (err) {
             cb(err);
         } else {
             cb(new StewError("This path is already in a stew project.","STEW ALREADY EXISTS"));
         }
     });
 }
 
module.exports.StewError = StewError;
