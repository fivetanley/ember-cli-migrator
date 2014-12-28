var path = require('path');
var string = require('underscore.string');

// TODO(Tony) bring this into prototype
function TypedExport(options) {
  // Each export module needs a type
  this.type = options.type || 'unknown';
  // The ast nodes that will go into this export module
  this.astNodes = [];
  // Output directory for module files
  this.outputDirectory = options.outputDirectory;
  // Set the export name for the module
  this.exportName = options.exportName;
  this.fileName = options.fileName;
}

TypedExport.prototype = Object.create(null);

TypedExport.knownTypes = ['model', 'serializer', 'controller', 'view', 'mixin', 'transform'];

TypedExport.pluralizeType = function(type) {
  return type + 's';
}

TypedExport.determineType = function(filePath, className) {
  // First check to see if any class matches
  var type = 'unknown';
  if (!className) {
    return type;
  }

  TypedExport.knownTypes.forEach(function(testType) {
    var r = new RegExp(string.titleize(testType));
    if (r.test(className)) {
      type = testType;
    }
  }, this);

  // Check to see if filename provides type, if we did not find it from classname
  if (type === 'unknown') {
    TypedExport.knownTypes.forEach(function(testType) {
      var r = new RegExp(TypedExport.pluralizeType(testType));
      if (r.test(filePath)) {
        type = testType;
      }
    }, this);
  }
  return type;
}

// TODO(Tony) handle path and name
TypedExport.prototype.exportPath = function(appName) {
  return '/' + appName + '/' + this.fileName;
};

TypedExport.prototype.outputFolderPath = function(appName) {
  return path.join(this.outputDirectory, path.dirname(this.exportPath(appName)));
};

TypedExport.prototype.outputFilePath = function(appName) {
  var fileName = path.basename(this.fileName);
  var folderPath = this.outputFolderPath(appName);
  return path.join(folderPath, string.dasherize(fileName));
};

TypedExport.convertToOutputFilename = function(stringInput) {
    var filename = [];
    var chars = string.chars(stringInput);
    function isUpperCase(str) { return (str === str.toUpperCase() && !isLowerCase(str)); }
    function isLowerCase(str) { return (str === str.toLowerCase()); }
    chars.forEach(function(c, i) {
      if (i>0 && isLowerCase(chars[i-1]) && isUpperCase(c)) {
        filename.push('-');
      }
      filename.push(c);
    });
    return filename.join('').toLowerCase();
}

TypedExport.filePathForClassname = function(className, type, filePath, exportFiles) {
  var newFilePath;
  if (type === 'unknown') {
    newFilePath = filePath;
  } else {
    var filename = TypedExport.convertToOutputFilename(className);

    var fileParts = filename.split('-');
    var shouldPop = false;
    TypedExport.knownTypes.forEach(function(testType) {
      var r = new RegExp(testType);
      // If we are a known type and the type is on the last part of the filename remove it
      if (type === testType && r.test(fileParts[fileParts.length-1])) {
        shouldPop = true;
      }
    });
    if (shouldPop) {
      fileParts.pop();
    }
    filename = fileParts.join('-');
    newFilePath = TypedExport.pluralizeType(type) + "/" + filename + ".js";
  }

  // Check to see if we are colliding with previous export filenames
  // TODO(Tony) - className is null if we are not actually trying to export and
  // therefore we want it to map to an existing filename
  if (className && newFilePath in exportFiles) {
    if (type === "unknown") {
      var splitPath = filePath.split("/");
      var filename = TypedExport.convertToOutputFilename(className);
      splitPath[splitPath.length - 1] = filename + ".js";
      newFilePath = splitPath.join("/");
    }
    if (newFilePath in exportFiles) {
      // In the rare case that we have a className, i.e., we were trying to put
      // something on the global App namespace, but it is going to be same to
      // the same split file (probably have same dasherized name, e.g., dupName,
      // and DupName).
      var nameWithoutExt = newFilePath.slice(0,newFilePath.indexOf(".js"));
      newFilePath = nameWithoutExt + "-x.js";
    }
    // Don't know why we would have more than two classNames trying to map to the same export file
    if (newFilePath in exportFiles) {
      console.log('Bad things happening, multiple redundant global export for className:', className);
    }
  }
  return newFilePath;
}

module.exports = TypedExport;
