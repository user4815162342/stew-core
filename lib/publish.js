var Q = require('q');
var docs = require('./docs');
var properties = require('./properties');
var StewError = require("./errors.js").StewError;
var utils = require("./utils");
var fs = require('fs');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');

// This unit is designed like a 'plugin'. The only thing you need to do
// is require the unit in StewProject, and everything's added in that's
// necessary. To remove the functionality, just remove it. It's not likely
// that I'm going to treat it like that, but it's a good way to test
// the potential for plugins to the core (or for some other system based
// on the same kind of mixin architecture). 

/**
 * The publish routine basically combines the primary publishable documents 
 * into one file. It requires pandoc to do the combining, and in
 * many cases libreoffice to convert the documents into something pandoc
 * can read.
 * */

 /* NOTE:
  * Conversion System:
  * - Pandoc 1.9.1.1 can read the following formats:
  *   - native (native Haskell)
  *   - json (JSON version of native AST)
  *   - markdown (pandoc’s extended markdown)
  *   - textile (Textile)
  *   - rst (reStructuredText)
  *   - html (HTML)
  *   - latex (LaTeX). 
  * - The following is a non-definitive list of some major word processing
  * formats that LibreOffice can read and write, which we can use for
  * this (can also support HTML, and TXT but that doesn't need to be converted).
  * - EPS
  * - DOCX
  * - RTF
  * - XML?
  * - DOC
  * - ODT
  * - FODT
  * - SXW
  * - PDF
  * - UOF
  * - WPD
  * 
  * - This means that almost everything requires me to open it up
  * in libreoffice. And, the only thing I can convert it to using LibreOffice
  * is HTML.
  * - NOTE: Later versions of Pandoc support more input formats, but the only
  * additional one which libreoffice also supports is DOCX, and when
  * specifying multiple DOCX files at the command line, pandoc (as of 1.13.2) 
  * only outputs the first one, and ignores the rest, so it's useless as
  * an input format.
  * */

// FUTURE: There are some inadequacies in this system. 
// - I would like to be able to insert page breaks before or after certain
// categories, however, the formats I can get pandoc 1.9.1 to read, and
// which I can convert libreoffice documents into (pretty much just HTML)
// don't really support them.
// - If there is a complex mix of document types in here, pandoc won't
// be able to handle them -- it expects all documents to be of the same
// format. This means that all primary documents must be the same format,
// or if they are a libreoffice format, they must all be that or html.
// (Although, as HTML is valid markdown, it's not too difficult to mix
// those two...)
// - sometimes, pandoc may be unnecessary, or there are better tools for
// the job. For example, if you're combining ODT or PDF documents together
// into a ODT or PDF output, there are scripts to concatenate libreoffice
// writer documents. The whole setup is somewhat complex, and I thought 
// pandoc was designed to handle all of that, but apparently not 
// (yet, at least).

/**
 * This is a properties mix-in which contains properties necessary for
 * the publishable functionality, below. */
var PublishProperties = function(prototype,managed) {
    managed.push("title");    
    
    // This works a little different than string array, as we
    // don't have any implied order for tags.

    // FUTURE: I wonder if the 'publish' property should be in here as well.

    /** Sometimes, the "name" of the document isn't the same as the title, probably because of filename issues.*/
    // FUTURE: The default should be the basename of the document, but that's
    // not really accessible from inside a properties object, so that will
    // have to be managed based on a void 0 value.    
    prototype.title = properties.getOrSetPropertyFunc("title",void 0,"string");
    
}

var PublishCategoryProperties = function(prototype,managed) {
    managed.push("publishTitle");
    managed.push("publishTitleLevel");
    managed.push("publishTitlePrefix");
    // FUTURE: managed.push("publishBreakBefore");
    // FUTURE: managed.push("publishBreakAfter");
    managed.push("publishMarkerBefore");
    managed.push("publishMarkerAfter");
    managed.push("publishMarkerBetween");
    
    /** publishTitle: Specifies whether the 'title' of the specified object should be published. */
    prototype.publishTitle = properties.getOrSetPropertyFunc("publishTitle",false,"boolean");
    /** titleLevel: Specifies the "level" of the category when published. For example, "book" might be level 1, "chapter" level 2, etc. */
    prototype.publishTitleLevel = properties.getOrSetPropertyFunc("publishTitleLevel",1,"number");
    /** titlePrefix: Specifies the text to appear before the prefix to be included (will appear before the 'number'. For example, "Book", "Chapter". Also, certain substitution parameters can be in cluded:
    - %R: insert a capital roman numberal here, according to the number of other items in the category in the published document.
    - %r: insert a lowercase roman numeral.
    - %N: insert an arabic numeral here, according to the numbers of the other items in the category in the published document.
    - %A: insert a capital alphabetic letter here, according to the numbers of the other items in the category in the published document.
    - %a: insert a lowercase alphabetic letter. */
    prototype.publishTitlePrefix = properties.getOrSetPropertyFunc("publishTitlePrefix","","string");
    /** publishBreakBefore: specifies whether a page break should occur before the item when published.*/
    // FUTURE: prototype.publishBreakBefore = properties.getOrSetPropertyFunc("publishBreakBefore",false,"boolean");
    /** publishBreakAfter: specifies whether a page break should occur after the item when publisshed.*/
    // FUTURE: prototype.publishBreakAfter = properties.getOrSetPropertyFunc("publishBreakAfter",false,"boolean");
    /** publishMarkerBefore: specifies whether a section marker should occur before the item when published.*/
    prototype.publishMarkerBefore = properties.getOrSetPropertyFunc("publishMarkerBefore",false,"boolean");
    /** publishMarkerAfter: specifies whether a section marker should occur after the item when publisshed.*/
    prototype.publishMarkerAfter = properties.getOrSetPropertyFunc("publishMarkerAfter",false,"boolean");
    /** publishMarkerBetween: specifies whether a section marker should occur between two items of the same category.*/
    prototype.publishMarkerBetween = properties.getOrSetPropertyFunc("publishMarkerBetween",false,"boolean");
}

var PublishStewProperties = function(prototype,managed) {
    managed.push("defaultPublishExtensions");
    
    prototype.defaultPublishExtension = properties.getOrSetPropertyFunc("defaultPublishExtension",void 0,"string");
    // FUTURE: Possibly, a publish target location as well.
}


 var publishFilter = function(doc) {
     return doc.properties().then(function(props) {
         return {
             accept: !!props.publish(),
             recurse: !!props.publish()
         }
     });
 }
 
 var Publisher = function(doc,outputFile,report,dryRun) {
     this.doc = doc;
     // If no outputfile is specified, create one inside the project.
     this.outputFile = outputFile || path.join(doc._project.basePath(),"published",doc.path() + "-" + utils.timestamp(6,true));
     this.doReport = report || function() {};
     this.dryRun = dryRun;
     this.tempPath = path.join(os.tmpdir(),"stew-publish-" + utils.timestamp(6,true));
     this.tempFileID = 1;
 }
 
 Publisher.prototype.getStew = function() {
     this.doReport("Finding categories");
     return this.doc._project.stew().then(function(stew) {
         this.stew = stew;
         if (path.extname(this.outputFile) === '') {
             this.outputFile += ("." + (stew.defaultPublishExtension() || stew.defaultDocExtension()));
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
     this.categoryCounts = {};
     return utils.promiseForEach(this.documents,this.gatherDocumentFiles.bind(this));
 }
 
 Publisher.prototype.getTemporaryFilename = function(ext) {
     var name = path.join(this.tempPath,"file" + this.tempFileID + ext);
     this.tempFileID += 1;
     return name;
 }
 
 Publisher.prototype.createTemporaryFile = function(text,ext) {
     var name = this.getTemporaryFilename(ext);
     if (!this.dryRun) {
         // TODO: Switch to q-io
        return Q.nbind(mkdirp)(path.dirname(name)).then(function() {
            return Q.nbind(fs.writeFile,fs)(name,text).then(function() {
                return name;
            });
        });
     }
     return Q(name);
 }
 
 Publisher.prototype.createMarkerFile = function() {
     this.doReport("Creating marker file.");
     return this.createTemporaryFile("<hr/>",".html").then(function(filename) {
         this.filesToCompile.push(filename);
     }.bind(this));;
 }
 
 // FUTURE: Since I'm converting into HTML before using pandoc, and HTML
 // doesn't support page breaks, this doesn't work. Markdown also doesn't
 // support pagebreaks, and there seems to few solutions for Pandoc to
 // support them. Latex would support them, but LibreOffice doesn't convert
 // into them. I guess my best chance is to simply wait for pandoc to
 // support ODT input and hope for the best.
 //Publisher.prototype.createBreakFile = function() {
 //    this.doReport("Creating break file.");
 //    return this.createTemporaryFile(????).then(function(filename) {
 //        this.filesToCompile.push(filename);
 //    }.bind(this));;;
 //}
 
 Publisher.prototype.createTitleFile = function(doc,props,category) {
     var title = props.title() || doc.baseName();
     var level = category.publishTitleLevel() || 1;
     var number = this.categoryCounts[props.category()] || 1;
     var prefix = category.publishTitlePrefix() || "";
     // bind the functions to avoid doing the calculations unless
     // the item replace function actually finds something to replace.
     // The only problem with this is that the calculation will occur
     // twice if the user specifies multiples of the same kind.
     prefix = prefix.replace("%R",utils.NumberToRoman.bind(null,number,false));
     prefix = prefix.replace("%r",utils.NumberToRoman.bind(null,number,true));
     prefix = prefix.replace("%A",utils.NumberToLetter.bind(null,number,false));
     prefix = prefix.replace("%a",utils.NumberToLetter.bind(null,number,true));
     prefix = prefix.replace(/%[nN]/,number);
     if (prefix[prefix.length - 1] !== " ") {
         prefix += " ";
     }
     var text = "<h" + level + ">" + prefix + title + "</h" + level + ">";
     
     this.doReport("Creating Title File: " + text);
     return this.createTemporaryFile(text,".html").then(function(filename) {
         this.filesToCompile.push(filename);
     }.bind(this));
 }
 
 Publisher.prototype.getLibreOfficeProfileFolder = function() {
     if (!this._loprofile) {
         this._loprofile = this.getTemporaryFilename("");
     }
     return this._loprofile;
 }
 
 var libreoffice_extensions = [
    ".eps",".docx",".rtf",".xml",".doc",".odt",".fodt",".sxw",".pdf",".uof",".wpd"
 ]
 

 // The long name is in case I find a better way to do this in certain situations. 
 Publisher.prototype.convertToHTMLUsingLibreOffice = function(file) {
     this.doReport("Converting File: " + file);
     // since libreoffice doesn't let me specify the output file name, but bases that value on the original
     // filename, I need to create a separate folder for each one, to avoid potential naming conflicts.
     var tempOutputDir = this.getTemporaryFilename("");
     // libreoffice "-env:UserInstallation=file:///tmp/LibO_Conversion" --headless --invisible --convert-to csv file.xls
     // the -env parameter allows us to specify a different profile folder, and therefore
     // run the conversion even if LibreOffice is already running. Without this, it won't
     // work if LibreOffice is currently open with a document.
     var args = ["-env:UserInstallation=file:///" + this.getLibreOfficeProfileFolder(),"--headless","--convert-to","html:HTML","--outdir",tempOutputDir,file];
     if (this.dryRun) {
         this.doReport("NOT RUNNING: libreoffice " + args.join(" "));
     } else {
         return utils.promiseProcess("libreoffice",args).then(function() {
             // I wish libreoffice just let me specify where to put the file instead.
             return path.join(tempOutputDir,path.basename(file,path.extname(file)) + ".html");
         },function(err) {
             if (err.code === "ENOENT") {
                 throw new StewError("LibreOffice needs to be installed in order to convert your ODT files into something pandoc can read.");
             }
             throw err;
         });
     }
     return Q(path.join(tempOutputDir,path.basename(file,path.extname(file)) + ".html"));
     
 }
 
 Publisher.prototype.processPrimaryFile = function(doc) {
     return doc.getPrimaries().then(function(list) {
         var primary = null;
         if (list.length > 1) {
             var expectedExt = this.stew.defaultDocExtension();
             list = list.filter(function(item) {
                 return path.extname(item) === ("." + expectedExt);
             });
             if (list.length > 1) {
                 throw new StewError("Can't determine primary file for doc: " + doc.path());
             } else if (list.length === 1) {
                 primary = list[0];
             } else {
                 throw new StewError("Can't determine primary file for doc: " + doc.path() + ". Please specify defaultDocExtension in stew properties, or delete extraneous files, in order to publish this file.");
             }
             
         } else if (list.length === 1) {
             primary = list[0];
         } else {
             // don't process this document, there's nothing to process.
             return;
         }
         
         if (libreoffice_extensions.indexOf(path.extname(primary)) > -1) {
             return this.convertToHTMLUsingLibreOffice(primary).then(function(filename) {
                 this.filesToCompile.push(filename);
             }.bind(this));
         } else {
             this.doReport("Adding Primary File: " + path.basename(primary));
             this.filesToCompile.push(primary);
         }
         
     }.bind(this));
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
         // FUTURE: 
         // if (category.publishBreakBefore()) {
         //    tasks.push(this.createBreakFile.bind(this));
         //}
         if (category.publishMarkerBefore()) {
             tasks.push(this.createMarkerFile.bind(this));
         }
         if (category.publishTitle()) {
             tasks.push(this.createTitleFile.bind(this,doc,props,category));
         }
         tasks.push(this.processPrimaryFile.bind(this,doc));
         
         if (category.publishMarkerAfter()) {
             tasks.push(this.createMarkerFile.bind(this));
         }

         // FUTURE:
         //if (category.publishBreakAfter()) {
         //    tasks.push(this.createBreakFile.bind(this));
         //}
         
         this.lastCategory = categoryName;
         
         return utils.promiseForEach(tasks,function(task) {
             return task();
         });
         
     }.bind(this));
 }
 
 Publisher.prototype.compileDocument = function() {
     this.doReport("Compiling Document.");
     var args = ["-s","-o",this.outputFile].concat(this.filesToCompile);
     if (this.dryRun) {
         this.doReport("NOT RUNNING: pandoc " + args.join(" "));
         return Q();
     } else {
        return Q.nbind(mkdirp)(path.dirname(this.outputFile)).then(function() {
             return utils.promiseProcess("pandoc",args).catch(function(err) {
                 if (err.code === "ENOENT") {
                     throw new StewError("Pandoc needs to be installed in order to compile your documents into one big document.");
                 }
                 throw err;
             });
        });
     }
 }
 
 Publisher.prototype.deleteTemporaryFiles = function() {
     this.doReport("Deleting temporary files");
     if (!this.dryRun) {
         // Just delete the whole folder, so I don't need to track all of the files.
         return Q.nbind(rimraf)(this.tempPath);
     }
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
     prototype.publish = function(outputFile,report,dryRun) {

         var publisher = new Publisher(this,outputFile,report,dryRun);
         
         return publisher.run();
         
     }
         
 }

// Now apply the mixins.
Publishable(docs.Doc.prototype);
properties.DocProperties.extendProperties(PublishProperties); 

Publishable(docs.ProjectRootContent.prototype);
properties.ProjectRootProperties.extendProperties(PublishProperties);

properties.CategoryDefinition.extendProperties(PublishCategoryProperties);
properties.StewProperties.extendProperties(PublishStewProperties);
