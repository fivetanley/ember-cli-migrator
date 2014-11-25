var walk = require('walk-sync');
var path = require('path');
var mkdirp = require('mkdirp');
var recast = require('recast');
var string = require('underscore.string');
var fs = require('fs');

// Recast helpers
var builders = recast.types.builders;
var namedTypes = recast.types.namedTypes;

function EmberMigrator(options){
  // Directory to process
  this.inputDirectory = options.inputDirectory;
  // Where we will place the ember-cli app
  this.outputDirectory  = options.outputDirectory;
  // Global app name used in input files
  this.rootAppName = options.rootAppName || 'App';
  // Our ember-cli app name
  this.appName = options.appName;
  // The first phase of our app will split files this map contains filenames as
  // keys and array of asts as values
  this.splitFiles = {};
  // The final stage converts the files and stores in this map that first hashes by
  // type and then by filename
  this.convertedFiles = Object.create(null),
  // Map from class name to export path in ember-cli
  this.classesFilepathMap = Object.create(null);

  // TODO(Tony) one of these per file would be good
  this.typedExport = new TypedExport({
    outputDirectory: this.outputDirectory
  });
}

var Visitor = recast.Visitor;

// The primary purpose of the preprocess visitor is to find the exportName or className
// for the main class in the file
var PreprocessVisitor = Visitor.extend({
  init: function(options) {
    this.rootAppName = options.rootAppName;
    this.classesFilepathMap = options.classesFilepathMap;
  },
  visitAssignmentExpression: function(node){
    var leftNode = node.left;
    // We assume the class is an assignment to a member of the root app
    if (namedTypes.MemberExpression.check(leftNode) && leftNode.object.name === this.rootAppName){
      this._exportName = leftNode.property.name;
    }
    return node;
  }
});

// The primary purpose of the process visitor is to find the set of all imports we need
// to construct the output file
var MigratorVisitor = Visitor.extend({
  init: function(options) {
    this.rootAppName = options.rootAppName;
    this.classesFilepathMap = options.classesFilepathMap;
    // This is what we will construct our import strings from
    this.imports = {};
  },

  visitMemberExpression: function(node){
    // Check all member expressions, e.g., object.name, in order to find imports we need
    var isExpression = namedTypes.MemberExpression.check(node) && node.object.object;
    if (isExpression && (node.object.object.name === "Ember" || node.object.object.name === "Em")){
      // We are using Ember or Em namespace so import Ember
      this.imports["Ember"] = 'Ember';
    } else if (isExpression && node.object.object.name === "DS") {
      // We are using DS namespace so import ember-data
      this.imports["DS"] = 'ember-data';
    } else if (isExpression && node.object.object.name === this.rootAppName){
      // We are using the global App namespace so we need to import something from our ember-cli structure
      var name = node.object.property.name;
      if (this.classesFilepathMap[name]) {
        this.imports[name] = this.classesFilepathMap[name];
      } else {
        console.log("Do not know how to import", name);
      }
    }
    return node;
  },

  // The secondary purpose of this visitor is to replace the app assignment with a var assignment so that
  // we are ready to export the var rather than use globals
  visitAssignmentExpression: function(node){
    var leftNode = node.left;
    var rightNode = node.right;
    if (namedTypes.MemberExpression.check(node.left) && leftNode.object.name === this.rootAppName){
      this._exportName = leftNode.property.name;
      var newNode = builders.variableDeclaration("var", [builders.variableDeclarator(builders.identifier(leftNode.property.name), rightNode)]);
      // Recursively check this node to see if it is a member expression and we need an import
      this.genericVisit(newNode);
      return newNode;
    }
    return node;
  }
});

EmberMigrator.prototype = Object.create(null);

EmberMigrator.prototype.run = function EmberMigrator_run(){
  var self = this;
  var files = walk(this.inputDirectory);

  // Here is where we control what files we will process in the input directory
  files = files.filter(function(file){
    var fullPath = path.join(self.inputDirectory, file);
    var isDir = fs.lstatSync(fullPath).isDirectory();
    var isJS = string.endsWith(file, '.js');
    return !isDir && isJS;
  });

  //We do a three pass transpiling process:
  //1. Split files based on classes, only one per file allowed
  //2. Figure out destination file and class names to know the imports
  //3. Now that we know all the possible imports, actually process the files and rewrite them

  // TODO(Tony) make more functional and return outputs
  files.forEach(this.splitFile.bind(this));
  console.log('preprocess');

  // TODO(Tony) splitFiles should contain the type info and keep it with it from then on
  Object.keys(this.splitFiles).forEach(function(key) {
    self.preProcessFile(key, self.splitFiles[key]);
  });
  console.log('process');
  Object.keys(this.splitFiles).forEach(function(key) {
    self.processFile(key, self.splitFiles[key]);
  });
  console.log('flush');
  this.flushConvertedFiles();
};

EmberMigrator.prototype.splitFile = function(filePath) {

  var file = fs.readFileSync(path.join(this.inputDirectory, filePath)).toString();
  console.log('splitting file', path.join(this.inputDirectory, filePath));
  var ast = recast.parse(file);
  var astBody = ast.program.body;
  var logBody = astBody.length > 1;
  var assignmentCount = 0;

  var that = this;
  var addNodeSomewhere = function(node, filePath, className) {
    var newType = that.typedExport.determineType(filePath, className);
    var fileName = that.typedExport.filePathForClassname(className, newType, filePath);
    if (!that.splitFiles[fileName]) {
      that.splitFiles[fileName] = [];
    }
    that.splitFiles[fileName].push(node);
  };

  astBody.forEach(function(node) {
    var isNodeStored = false;
    var newType;
    var fileName;
    var className;

    if (namedTypes.ExpressionStatement.check(node)) {

      // We know we are an assignment
      var expression = node.expression;
      if (namedTypes.AssignmentExpression.check(expression) &&
          namedTypes.MemberExpression.check(expression.left) &&
          expression.left.object.name === this.rootAppName) {


        // We are assigning a class on the root app
        className = expression.left.property.name;
        if (assignmentCount > 0) {

          // We have already stored one class into a file so we need to split
          // files and store the class in a new file
          // TODO(Tony): This needs to stay separate from below because the node Needs
          // to be exported therefore in a separate file.
          addNodeSomewhere(node, filePath, className);
        } else {

          // This is the first class so it will go to the original filename as default
          addNodeSomewhere(node, filePath, className);
        }
        isNodeStored = true;
        assignmentCount++;
      }
    }
    if (!isNodeStored) {
      // Any other code that is not a global class assignment on root app goes into the
      // original filename
      var newFilePath = string.dasherize(filePath);
      console.log('adding node', newFilePath , this.splitFiles[newFilePath]);
      if (!this.splitFiles[newFilePath]) {
        this.splitFiles[newFilePath] = [];
      }
      this.splitFiles[newFilePath].push(node);
    }
  }, this);

};

//Needs to support one file exporting multiple classes
EmberMigrator.prototype.preProcessFile = function(filePath, ast) {
  var visitor = new PreprocessVisitor({rootAppName: this.rootAppName, classesFilepathMap:this.classesFilepathMap});
  visitor.visit(ast);
  var exportName = visitor._exportName;
  var type = this.typedExport.determineType(filePath, exportName);
  // Add an entry to the map between the class in this file and its ember-cli export file
  this.classesFilepathMap[exportName] = this.typedExport.filePathForType(type, this.appName, filePath);
};

EmberMigrator.prototype.processFile = function(filePath, ast){
  //TODO(Igor) split properly into fileName and className
  var type = this.typedExport.determineType(path.dirname(filePath), filePath);
  var fileName = path.basename(filePath);
  filePath = path.join(this.inputDirectory, filePath);

  if (!this.convertedFiles[type]) {
    // Create new type storage for previously unseen type
    this.convertedFiles[type] = Object.create(null);
  }
  this.convertedFiles[type][fileName] = this.convertFile(fileName, filePath, ast);
};

EmberMigrator.prototype.convertFile = function(modelName, filePath, ast){
  var visitor = new MigratorVisitor({rootAppName: this.rootAppName, classesFilepathMap: this.classesFilepathMap});
  visitor.visit(ast);
  var imports = Object.keys(visitor.imports).map(function(key){
    var importFilename = convertToOutputFilename(visitor.imports[key]);
    return "import " + key + " from \"" + importFilename + '";';
  }).join("\n");

  imports = imports.replace('.js', '');

  //Add two blank lines below imports if we have imports
  if (imports.length > 0) {
    imports = imports + "\n\n";
  }

  // Convert our ast into string in order to join with imports and do final processing
  var astCode = ast.map(function(node) { return recast.print(node).code; }).join('\n');
  var code = imports + astCode + '\n';
  code = code.replace(/;;\n+/g, ';\n'); // for some reason recast print will add another semicolon if there is already one
  code = code.replace(this.rootAppName + '.', '');
  code = code.replace('Em.', 'Ember.');
  code = code  + "\n" + "export default " + visitor._exportName + ";\n";

  return code;
};

EmberMigrator.prototype.flushConvertedFiles = function(){
   //Create directory for every path in our app including unknown folders
  Object.keys(this.convertedFiles).forEach(function(type) {
    console.log('making output folder', this.typedExport.outputFolderPathForType(type));
    mkdirp.sync(this.typedExport.outputFolderPathForType(type));
  }, this);

  Object.keys(this.convertedFiles).forEach(function(type){
    Object.keys(this.convertedFiles[type]).forEach(function(fileName){
      var fileContent = this.convertedFiles[type][fileName];
      console.log('fileName', fileName);
      fs.writeFileSync(this.typedExport.outputFilePath(fileName, type), fileContent);
    }, this);
  }, this);
};

// TODO(Tony) bring this into prototype
function TypedExport(options) {
  this.type = 'unknown';
  this.outputDirectory = options.outputDirectory;
}

TypedExport.prototype = Object.create(null);

TypedExport.prototype.knownTypes = ['model', 'serializer', 'controller', 'view', 'mixin'];

TypedExport.prototype.pluralizeType = function(type) {
  return type + 's';
}

TypedExport.prototype.determineType = function(filePath, className) {
  // First check to see if any class matches
  var type = 'unkown';
  this.knownTypes.forEach(function(testType) {
    var r = new RegExp(string.titleize(testType));
    if (r.test(className)) {
      type = testType;
    }
  }, this);

  // Check to see if filename provides type, if we did not find it from classname
  if (type === 'unkown') {
    this.knownTypes.forEach(function(testType) {
      var r = new RegExp(this.pluralizeType(testType));
      if (r.test(filePath)) {
        type = testType;
      }
    }, this);
  }
  return type
}

// TODO(Tony) handle path and name
TypedExport.prototype.filePathForType = function(type, appName, filePath) {
  var fileName = path.basename(filePath);
  var foundTypes = this.knownTypes.filter(function(knownType) {
    return knownType === type
  });
  if (foundTypes.length > 0) {
    return '/' +  appName + '/' + this.pluralizeType(type) + '/' + fileName;
  } else {
    return '/' +  appName + '/' + filePath;
  }
}

TypedExport.prototype.outputFolderPathForType = function(type){
  return path.join(this.outputDirectory, 'app/' + this.pluralizeType(type));
};

TypedExport.prototype.outputFilePath = function(fileName, type) {
  var folderPath = this.outputFolderPathForType(type);
  return path.join(folderPath, string.dasherize(fileName));
};

TypedExport.prototype.filePathForClassname = function(className, type, filePath) {
  if (type === 'unknown') {
    return filePath;
  }

  var filename = convertToOutputFilename(className);

  var fileParts = filename.split('-');
  var shouldPop = false;
  this.knownTypes.forEach(function(testType) {
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
  return this.pluralizeType(type) + "/" + filename + ".js";
}

function convertToOutputFilename(stringInput) {
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

function capitalize(string){
  return string.charAt(0).toUpperCase() + string.slice(1);
}

module.exports = EmberMigrator;
