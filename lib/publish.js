var Q = require('q');
var docs = require('./docs');
var properties = require('./properties');

// This unit is designed like a 'plugin'. The only thing you need to do
// is require the unit in StewProject, and everything's added in that's
// necessary. To remove the functionality, just remove it. It's not likely
// that I'm going to treat it like that, but it's a good way to test
// the potential for plugins to the core (or for some other system based
// on the same kind of mixin architecture). 

/**
 * This is a properties mix-in which contains properties necessary for
 * the publishable functionality, below. */
var PublishProperties = function(prototype,managed) {
    managed.push("title");    
    
    // This works a little different than string array, as we
    // don't have any implied order for tags.

    // TODO: I wonder if the 'publish' property should be in here as well.

    /** Sometimes, the "name" of the document isn't the same as the title, probably because of filename issues.*/
    // FUTURE: The default should be the basename of the document, but that's
    // not really accessible from inside a properties object, so that will
    // have to be managed based on a void 0 value.    
    prototype.title = properties.getOrSetPropertyFunc("Title",void 0,"string");
    
}

var PublishCategoryProperties = function(prototype,managed) {
    managed.push("publishTitle");
    managed.push("publishTitleLevel");
    managed.push("publishTitlePrefix");
    managed.push("publishBreakBefore");
    managed.push("publishBreakAfter");
    managed.push("publishMarkerBetween");
    
    /** publishTitle: Specifies whether the 'title' of the specified object should be published. */
    prototype.publishTitle = properties.getOrSetPropertyFunc("PublishTitle",false,"boolean");
    /** titleLevel: Specifies the "level" of the category when published. For example, "book" might be level 1, "chapter" level 2, etc. */
    prototype.publishTitleLevel = properties.getOrSetPropertyFunc("PublishTitleLevel",1,"number");
    /** titlePrefix: Specifies the text to appear before the prefix to be included (will appear before the 'number'. For example, "Book", "Chapter". Also, certain substitution parameters can be in cluded:
    - %R: insert a capital roman numberal here, according to the number of other items in the category in the published document.
    - %N: insert an arabic numeral here, according to the numbers of the other items in the category in the published document.
    - %A: insert a capital alphabetic letter here, according to the numbers of the other items in the category in the published document.*/
    prototype.publishTitlePrefix = properties.getOrSetPropertyFunc("PublishTitlePrefix","","string");
    /** publishBreakBefore: specifies whether a page break should occur before the item when published.*/
    prototype.publishBreakBefore = properties.getOrSetPropertyFunc("PublishBreakBefore",false,"boolean");
    /** publishBreakAfter: specifies whether a page break should occur after the item when publisshed.*/
    prototype.publishBreakAfter = properties.getOrSetPropertyFunc("PublishBreakAfter",false,"boolean");
    /** publishMarkerBetween: specifies whether a section marker should occur between two items of the same category.*/
    prototype.publishMarkerBetween = properties.getOrSetPropertyFunc("PublishMarkerBetween",false,"boolean");
}

 // TODO: This is a repeat of what's in docs. Although, it's done in a slightly
 // more efficient, and maybe idiomatic way. It should perhaps be in some sort of 
 // utilities to be DRY.
 var promiseForEach = function(array,task) {
     // inspired by http://stackoverflow.com/a/17238793/300213
     var q = Q.defer();
     var i = 0;
     function loop() {
         if (i >= array.length) {
              return q.resolve();
         }
         Q.fcall(task,array[i],i).then(loop,q.reject);
         i += 1;
     }
     // put the loop in the next tick to avoid a synchronous surprise.
     Q.nextTick(loop);
     return q.promise;
 }
 
 var publishFilter = function(doc) {
     return doc.properties().then(function(props) {
         return {
             accept: !!props.publish(),
             recurse: true
         }
     });
 }

 // TODO: Repeat of something in attachments... 
 var pad = function(num) {
    norm = Math.abs(Math.floor(num));
    return (norm < 10 ? '0' : '') + norm;
 }

 // TODO: Almost a repeat of something in attachments. perhaps this is another thing that
 // needs to go into utilities.
 var timestamp = function() {
    // from http://stackoverflow.com/a/17415677/300213
    // with modifications to get something that looks like this:
    //`backup-2006-08-23-19-33-44.456+0000.rtf` (since colons are not good names,
    // and I want milliseconds).
    var local = new Date();
    return local.getFullYear() 
        + '-' + pad(local.getMonth()+1)
        + '-' + pad(local.getDate())
        + '-' + pad(local.getHours())
        + '-' + pad(local.getMinutes()) 
        + '-' + pad(local.getSeconds()) 
 }

 
 var Publisher = function(doc,outputFile,report,dryRun) {
     this.doc = doc;
     // If no outputfile is specified, create one inside the project.
     this.outputFile = outputFile || path.join(doc._project.basePath(),"published",timestamp());
     this.doReport = report || function() {};
     this.dryRun = dryRun;
 }
 
 Publisher.prototype.getStew = function() {
     this.doReport("Finding categories");
     return this.doc._project.stew().then(function(stew) {
         this.stew = stew;
         if (path.extname(this.outputFile) === '') {
             this.outputFile += ("." + stew.defaultDocExtension());
         }
     }.bind(this))
 }
 
 Publisher.prototype.getDocs = function() {
     this.doReport("Listing documents");
     return this.doc.listDocs(publishFilter).then(function(documents) {
         if (!(this.doc instanceof docs.ProjectRootContent)) {
             documents.unshift(this.doc);
         }
         this.documents = documents;
     }.bind(this));
 }
 
 Publisher.prototype.gatherFiles = function() {
     this.doReport("Gathering files");
     this.lastCategory = null;
     this.filesToCompile = [];
     this.tempFilesToDelete = [];
     this.categoryCounts = {};
     return promiseForEach(this.documents,this.gatherDocumentFiles.bind(this));
 }
 
 Publisher.prototype.createMarkerFile = function() {
     // TODO:
     return Q();
 }
 
 Publisher.prototype.createBreakFile = function() {
     // TODO:
     return Q();
 }
 
 Publisher.prototype.createTitleFile = function(doc,props,category) {
     // TODO:
     return Q();
 }
 
 Publisher.prototype.processPrimaryFile = function(doc) {
     // TODO:
     return Q();
 }
 
 Publisher.prototype.gatherDocumentFiles = function(doc) {
     this.doReport("Processing " + doc.baseName());
     return doc.properties().then(function(props) {
         var categoryName = props.category();
         var category = this.stew.getCategory(categoryName) || new properties.CategoryDefinition({});
         this.categoryCounts[categoryName] = (this.categoryCounts[categoryName] || 0) + 1;
         
         var tasks = [];
         
         if ((categoryName === this.lastCategory) && category.publishMarkerBetween()) {
             tasks.push(this.createMarkerFile.bind(this));
         }
         if (category.publishBreakBefore()) {
             tasks.push(this.createBreakFile.bind(this));
         }
         if (category.publishTitle()) {
             tasks.push(this.createTitleFile.bind(this,doc,props,category));
         }
         tasks.push(this.processPrimaryFile.bind(this,doc));
         
         if (category.publishBreakAfter()) {
             tasks.push(this.createBreakFile.bind(this));
         }
         
         this.lastCategory = categoryName;
         
         return promiseForEach(tasks,function(task) {
             return task();
         });
         
     }.bind(this));
 }
 
 Publisher.prototype.compileDocument = function() {
     // TODO:
     return Q();
 }
 
 Publisher.prototype.deleteTemporaryFiles = function() {
     // TODO:
     return Q();
 }
 
 Publisher.prototype.run = function() {
     if (this.dryRun) {
         this.doReport("This is just a dry run, nothing will actually be done.");
     }
     
     return this.getStew().
             then(this.getDocs.bind(this)).
             then(this.gatherFiles.bind(this)).
             then(this.compileDocument.bind(this)).
             then(this.deleteTemporaryFiles.bind(this)).
             then(function() {
                 return this.outputFile;
             }.bind(this));

 }
 
/**
 * This is a mix-in which allows a document to be published.
 * */ 
 var Publishable = module.exports.Publishable = function(prototype) {

     /**
      * Attempts to publish the document and it's contents, according to 
      * whether 'publish' is true. This will create one big massive file
      * at the specified location containing all of the contents. 
      * 
      * The outputFile passed is a full file path, not a document path
      * within the project. The type of the document to be created is determined 
      * based on the extension of the file. The available output formats
      * depend on the local installation of pandoc.
      * 
      * outputFile: The full path for the output file to be published to. It will be overwritten.
      * progress: a function callback which can receive "progress messages".
      * dryRun: lists actions which would be done using the progress messages, 
      * but doesn't actually make any disk changes.
      * 
      * NOTE: pandoc must be installed on the system in order to do this.
      * 
      * NOTE: libreoffice must be installed on the system if any of the documents are .odt files.
      * 
      * NOTE: There may be some document types which pandoc can not read,
      * these documents simply can not be published.
      * */
      // TODO: Do I want to check if pandoc is installed (using pandoc -v)
      // before running? How about libreoffice (using libreoffice --version)
      // if we run into odt files? These options would also potentially
      // allow us to determine capabilities, for example: if some future
      // version of pandoc accepts .odt files, then I don't need to
      // call libreoffice anymore.
     prototype.publish = function(outputFile,report,dryRun) {
         // TODO: Until we get this running, just make everything a dry run.
         dryRun = true;

         var publisher = new Publisher(this,outputFile,report,dryRun);
         
         return publisher.run();
         
     }
         
     /*
TODO: Publishing:

- Okay, so here goes the process:
  - build a list of documents to be published. The list of documents to be published will be the same
as calling listDocs with a "recurse(publish)" filter on the document on 
which publish is called, except it will also include itself as a document (unless itself is
ProjectRootContent, in which case, no, because that doesn't have a category, or a title, or anything).
  - create a "numbers" object which will contain category names mapped to numbers.
  - create a "files" list which will contain paths of files to be put together with pandoc.
  - With each document:
    - look at it's category. 
      - if the category says "publishTitle" is true, then:
        - create a temporary "before" file containing the 'title' of the document from it's properties, or the basename of the 
          document if that doesn't exist. The "text" file is going to be in markdown, html or possibly latex.
        - if the category has a titleLevel, then the title's level is specified according to that, otherwise it will get a level of 1.
        - if the category has a titlePrefex, then that has to be calculated (including the substitution parameter) and applied to
        the text file. If the category is not mentioned in the "numbers" object, give it a number of 1, and set the property on the numbers object to 2. Otherwise, give it the number from the "numbers" object, and increment that. Translate the number
        according to the substitution variable provided.
      - if the category says "publishBreakBefore" is true, then do whatever it takes to put a page break into the "before" file. I have to play around with this, if the text file is in latex format, I might be able to insert the page break there and get it to convert to ODT or whatever.
      - if the category says "publishMarkerBetween", and the previous item processed was the same category, create a "between" text file indicating that a horizontal rule, or something else (I have to figure out what to do there).
      - if the category says publishBreakAfter, create an "after" file for after, see publishBreakBefore a little above.
    - if the file is an "ODT" file, use libreoffice --headless to convert it to HTML first, because pandoc can't read ODT.
        See: http://ask.libreoffice.org/en/question/1686/how-to-not-connect-to-a-running-instance/ for how to do it to ensure
        that this will work whether libreoffice is running or not already. NOTE: This will change if pandoc ever supports ODT
        input.
    - Now, add the files in order to a list of files to process:
        - the "between" file if it exists.
        - the "before" file if it exists.
        - the document file (either the original file, or the HTML file converted from ODT) 
        - the "after" file if it exists.
  - Now, build a pandoc command line. Parameters are ["-s","-o",outputfileName].concat(files array to be process). And run it.      

*/     
     
 }

// Now apply the mixins.
Publishable(docs.Doc.prototype);
properties.DocProperties.extendProperties(PublishProperties); 
properties.CategoryDefinition.extendProperties(PublishCategoryProperties);

Publishable(docs.ProjectRootContent.prototype);
properties.ProjectRootProperties.extendProperties(PublishProperties);
