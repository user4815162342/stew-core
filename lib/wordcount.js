var Q = require('q');
var libreoffice = require('./lo-utils');
var fs = require('q-io/fs');
var docs = require('./docs');
var utils = require('./utils');
var htmlToText = require('html-to-text');

// word matching came from the npm wordcount module originally. However,
// I found it inadequate because it didn't count certain characters,
// such as apostrophes, as words.
var wordRegExp = /[a-zA-Z0-9_\-'\u2019\u0392-\u03c9\u0400-\u04FF]+|[\u4E00-\u9FFF\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af\u0400-\u04FF]+|\w+/g;

function wordcount(str) {
  var m = str.match(wordRegExp);
  if (!m) return 0;
  return m.length;
};

 var publishFilter = function(doc) {
     return doc.properties().then(function(props) {
         return {
             accept: !!props.publish(),
             recurse: !!props.publish()
         }
     });
 }
 
 var WordCounter = function(doc,report,dryRun) {
     this.doc = doc;
     this.doReport = report || function() {};
     this.dryRun = dryRun;
     this.tempPath = path.join(os.tmpdir(),"stew-word-count-" + utils.timestamp(6,true));
     this.tempFileID = 1;
     this.totalWords = 0;
 }
 
 WordCounter.prototype.getStew = function() {
     this.doReport("Finding categories");
     return this.doc._project.stew().then(function(stew) {
         this.stew = stew;
     }.bind(this))
 }
 
 WordCounter.prototype.getDocs = function() {
     this.doReport("Listing documents");
     return this.doc.listDocs(publishFilter).then(function(documents) {
         if (!(this.doc instanceof docs.ProjectRootContent)) {
             documents.unshift(this.doc);
         }
         this.documents = documents;
     }.bind(this));
 }
 
 WordCounter.prototype.processDocuments = function() {
     this.doReport("Processing documents");
     this.filesToCount = [];
     return utils.promiseForEach(this.documents,this.processPrimaryFile.bind(this));
 }
 
 WordCounter.prototype.getTemporaryFilename = function(ext) {
     var name = path.join(this.tempPath,"file" + this.tempFileID + ext);
     this.tempFileID += 1;
     return name;
 }
 
 WordCounter.prototype.getLibreOfficeProfileFolder = function() {
     if (!this._loprofile) {
         this._loprofile = this.getTemporaryFilename("");
     }
     return this._loprofile;
 }
 
 

 // The long name is in case I find a better way to do this in certain situations. 
 WordCounter.prototype.convertToTextUsingLibreOffice = function(file) {
     // returns the name of the output file (which is a file in the folder
     // passed in the second argument)
     return libreoffice.convertToPlainText(file,
                     this.getTemporaryFilename(""),
                     this.getLibreOfficeProfileFolder(),
                     this.dryRun);
     
 }
 
 WordCounter.prototype.processPrimaryFile = function(doc) {
     return doc.getPrimaries().then(function(list) {
         var primary = null;
         if (list.length > 1) {
             var expectedExt = this.stew.defaultDocExtension();
             list = list.filter(function(item) {
                 return path.extname(item) === ("." + expectedExt);
             });
             if (list.length === 1) {
                 primary = list[0];
             }
             
         } else if (list.length === 1) {
             primary = list[0];
         } else {
             // don't process this document, there's nothing to process.
             return;
             
         }
         
        if (libreoffice.isCompatibleFile(primary)) {
             return this.convertToTextUsingLibreOffice(primary).then(function(filename) {
                 
                return fs.read(filename).then(function(data) {
                    var words = wordcount(data.toString());
                    this.totalWords += words;
                    
                    return Q.resolve();
                }.bind(this));
             }.bind(this));
       } else {
           // assume it's in HTML format 
           // so read it in and convert it to plain text. I would think
           // that it would leave actual plain text or markdown alone.
           return fs.read(primary).then(function(data) {
               // htmlToText does much more than I want it to, and therefore
               // is probably slower than it should be, but it should work
               // anyway.
               var text = htmlToText.fromString(data.toString(),{
                   tables: true,
                   wordwrap: false,
                   ignoreHref: true,
                   ignoreImage: true,
                   uppercaseHeadings: false,
                   returnDomByDefault: true
               })
               var words = wordcount(text);
               this.totalWords += words;
               return Q.resolve();
           }.bind(this));
       }
         
     }.bind(this));
 }
 
 WordCounter.prototype.deleteTemporaryFiles = function() {
     this.doReport("Deleting temporary files");
     if (!this.dryRun) {
         // Just delete the whole folder, so I don't need to track all of the files.
         return fs.removeTree(this.tempPath);
     }
     return Q();
 }
 
 WordCounter.prototype.run = function() {
     if (this.dryRun) {
         this.doReport("This is just a dry run, nothing will actually be done.");
     }
     
     return this.getStew().
             then(this.getDocs.bind(this)).
             then(this.processDocuments.bind(this)).
             then(this.deleteTemporaryFiles.bind(this)).
             then(function() {
                 return Q.resolve(this.totalWords);
             }.bind(this));

 }


/**
 * This is a mix-in which allows a document to have a method for counting words...
 * If primaries can't be retrieved, returns undefined.
 * 
 * A 'resources' object (just pass a blank object which will be re-used
 * on subsequent calls) can be used to improve performance on multiple calls.
 * When done, call wordCount.cleanupResources.
 * */ 
 var WordCountable = module.exports.WordCountable = function(prototype) {

     /**
      * Attempts to count the words in the document and it's contents, according to 
      * whether 'publish' is true. This will display the total words.
      * 
      * progress: a function callback which can receive "progress messages".
      * dryRun: lists actions which would be done using the progress messages, 
      * but doesn't actually make any disk changes.
      * 
      * NOTE: libreoffice must be installed on the system if any of the documents are .odt files.
      * 
      * */
     prototype.countWords = function(report,dryRun) {

         var counter = new WordCounter(this,report,dryRun);
         
         return counter.run();
         
     }
         
 }

// Now apply the mixins.
WordCountable(docs.Doc.prototype);
