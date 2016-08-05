var Q = require('q');
var utils = require("./utils");
var StewError = require("./errors.js").StewError;

var convertTo = module.exports.convertTo = function(file,outputDir,outputExt,outputFormat,profileFolder,dryRun) {
     // libreoffice "-env:UserInstallation=file:///tmp/LibO_Conversion" --headless --invisible --convert-to csv file.xls
     // the -env parameter allows us to specify a different profile folder, and therefore
     // run the conversion even if LibreOffice is already running. Without this, it won't
     // work if LibreOffice is currently open with a document.
     var args = ["-env:UserInstallation=file:///" + profileFolder,"--headless","--convert-to",outputExt + ":" + outputFormat,"--outdir",outputDir,file];
     if (dryRun) {
         console.log("NOT RUNNING: libreoffice " + args.join(" "));
     } else {
         return utils.promiseProcess("libreoffice",args).then(function() {
             // I wish libreoffice just let me specify where to put the file instead.
             return path.join(outputDir,path.basename(file,path.extname(file)) + "." + outputExt);
         },function(err) {
             if (err.code === "ENOENT") {
                 throw new StewError("LibreOffice needs to be installed in order to convert your ODT files into something pandoc can read.");
             }
             throw err;
         });
     }
     return Q(path.join(outputDir,path.basename(file,path.extname(file)) + "." + outputExt));
    
    
}

/* Converts the input file to HTML using libreoffice (the file must
 * be compatible with LibreOffice) into a temporary file. Returns
 * the output filename. The process needs a few resources:
 * - an output directory name to place the output file. Although the 
 * result file is named after the original file within that directory 
 * (this is a quirk of libreoffice itself and can't be controlled). 
 * - a directory to place a temporary libreoffice profile, that can
 * be shared with subsequent calls to improve performance. This prevents
 * libreoffice from using an existing instance of the application, which 
 * causes the command line conversion to fail.
 * - It can also take an option to do dry run only, in which case the command line
 * is output to the console. */
module.exports.convertToHTML = function(file,outputDir,profileFolder,dryRun) {
    return convertTo(file,outputDir,'html','HTML',profileFolder,dryRun);
}

module.exports.convertToPlainText = function(file,outputDir,profileFolder,dryRun) {
    return convertTo(file,outputDir,'txt','Text',profileFolder,dryRun);
}

var libreoffice_extensions = [
    ".eps",".docx",".rtf",".xml",".doc",".odt",".fodt",".sxw",".pdf",".uof",".wpd"
 ]
 

module.exports.isCompatibleFile = function(file) {
    return libreoffice_extensions.indexOf(path.extname(file)) > -1
}
