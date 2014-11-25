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

TypedExport.knownTypes = ['model', 'serializer', 'controller', 'view', 'mixin'];

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
}

TypedExport.prototype.outputFolderPath = function(appName) {
  return path.join(this.outputDirectory, appName + '/' + TypedExport.pluralizeType(this.type));
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

TypedExport.filePathForClassname = function(className, type, filePath) {
  if (type === 'unknown') {
    return filePath;
  }

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
  return TypedExport.pluralizeType(type) + "/" + filename + ".js";
}

module.exports = TypedExport;
