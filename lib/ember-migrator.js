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
}

var Visitor = recast.Visitor;

var PreprocessVisitor = Visitor.extend({
  init: function(options) {
    this.rootAppName = options.rootAppName;
    this.classesFilepathMap = options.classesFilepathMap;
    // This is what we will construct our import strings from
    this.imports = {};
  },

  // TODO(Tony) Pretty sure we only need this in the process visitor
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
        console.log("hello", name);
      }
    }
    return node;
  },

  visitAssignmentExpression: function(node){
    var leftNode = node.left;
    var rightNode = node.right;
    if (namedTypes.MemberExpression.check(leftNode) && leftNode.object.name === this.rootAppName){
      this._exportName = leftNode.property.name;
      // Recursively check this node to see if it is a member expression and we need an import
      this.genericVisit(node);
    }
    return node;
  }

});

var MigratorVisitor = PreprocessVisitor.extend({
  visitAssignmentExpression: function(node){
    var leftNode = node.left;
    var rightNode = node.right;
    if (namedTypes.MemberExpression.check(node.left) && leftNode.object.name === this.rootAppName){
      this._exportName = leftNode.property.name;
      var newNode = builders.variableDeclaration("var", [builders.variableDeclarator(builders.identifier(leftNode.property.name), rightNode)]);
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
  files.forEach(this.splitFile.bind(this));
  console.log('preprocess');
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

  var type = determineType(filePath);
  this.splitFiles[filePath] = [];
  astBody.forEach(function(node) {
    var isNodeStored = false;

    if (namedTypes.ExpressionStatement.check(node)) {
      // We know we are an assignment
      var expression = node.expression;
      if (namedTypes.AssignmentExpression.check(expression) &&
          namedTypes.MemberExpression.check(expression.left) &&
          expression.left.object.name === this.rootAppName) {
        // We are assigning a class on the root app
        var className = expression.left.property.name;
        if (assignmentCount > 0) {
          // We have already stored one class into a file so we need to split
          // files and store the class in a new file
          var newType = determineType(filePath, className);
          var fileName = filenameForClassname(className, newType);
          this.splitFiles[fileName] = [node];
        } else {
          // This is the first class so it will go to the original filename as default
          this.splitFiles[filePath].push(node);
        }
        isNodeStored = true;
        assignmentCount++;
      }
    }

    if (!isNodeStored) {
      // Any other code that is not a global class assignment on root app goes into the
      // original filename
      this.splitFiles[filePath].push(node);
    }
  }, this);

};

//Needs to support one file exporting multiple classes
EmberMigrator.prototype.preProcessFile = function(filePath, ast) {
  var fileName = path.basename(filePath);
  var visitor = new PreprocessVisitor({rootAppName: this.rootAppName, classesFilepathMap:this.classesFilepathMap});
  visitor.visit(ast);
  var exportName = visitor._exportName;
  var type = determineType(filePath, exportName);

  // Add an entry to the map between the class in this file and its ember-cli export file
  if (type === 'model') {
    console.log('exportName', exportName, 'fileName', fileName);
    this.classesFilepathMap[exportName] = '/' +  this.appName + '/models/' + fileName;
  } else if (type === 'serializer') {
    this.classesFilepathMap[exportName] = '/' +  this.appName + '/serializers/' + fileName;
  } else {
    // We don't know what type this is so we are just going to put it where it was in the new app
    console.log('exportName', exportName, '/' + this.appName + '/' + filePath);
    this.classesFilepathMap[exportName] = '/' + this.appName + '/' + filePath;
  }
};

EmberMigrator.prototype.processFile = function(fileName, ast){
  //TODO(Igor) split properly into fileName and className
  var type = determineType(path.dirname(fileName), fileName);
  var modelName = path.basename(fileName);
  fileName = path.join(this.inputDirectory, fileName);

  if (!this.convertedFiles[type]) {
    // Create new type storage for previously unseen type
    this.convertedFiles[type] = Object.create(null);
  }
  this.convertedFiles[type][modelName] = this.convertFile(modelName, fileName, ast);
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
  var astCode = ast.map(function(node) { return recast.print(node).code; }).join('/n');
  var code = imports + astCode + '\n';
  code = code.replace(/;;\n+/g, ';\n'); // for some reason recast print will add another semicolon if there is already one
  code = code.replace(this.rootAppName + '.', '');
  code = code.replace('Em.', 'Ember.');
  code = code  + "\n" + "export default " + visitor._exportName + ";\n";

  return code;
};

EmberMigrator.prototype.outputFolderPathForType = function(type){
  return path.join(this.outputDirectory, 'app/' + type + 's');
};

EmberMigrator.prototype.outputFilePath = function(fileName, type) {
  var folderPath = this.outputFolderPathForType(type);
  return path.join(folderPath, string.dasherize(fileName));
};

EmberMigrator.prototype.flushConvertedFiles = function(){
   //Create directory for every path in our app including unknown folders
  Object.keys(this.convertedFiles).forEach(function(type) {
    console.log('making output folder', this.outputFolderPathForType(type));
    mkdirp.sync(this.outputFolderPathForType(type));
  }, this);

  Object.keys(this.convertedFiles).forEach(function(type){
    Object.keys(this.convertedFiles[type]).forEach(function(fileName){
      var fileContent = this.convertedFiles[type][fileName];
      console.log('fileName', fileName);
      fs.writeFileSync(this.outputFilePath(fileName, type), fileContent);
    }, this);
  }, this);
};

var MODEL_PATH = /models/;
var SERIALIZERS_PATH = /serializers/;
var SERIALIZER = /Serializer/;

function determineType(filePath, className){
  //TODO(Igor) make smarter
  if (SERIALIZER.test(className)) {
    return 'serializer';
  } else if (MODEL_PATH.test(filePath)) {
    return 'model';
  } else if (SERIALIZERS_PATH.test(filePath)) {
    return 'serializer';
  }
  return 'unknown';
}

function convertToOutputFilename(stringInput) {
    var filename = string.dasherize(stringInput).toLowerCase();
    //If the string started with a capital letter, we want to strip the leading '-'
    if (filename[0] === '-') {
      filename = filename.substring(1);
    }
    return filename;
}

function filenameForClassname(className, type) {
  var filename = convertToOutputFilename(className);

  // Remove the last part of the filename if it is the type
  var fileParts = filename.split('-');
  if (type === 'serializer' && /serializer/.test(fileParts[fileParts.length-1])) {
    fileParts.pop();
  }
  filename = fileParts.join('-');
  return type + "s/" + filename + ".js";
}

function capitalize(string){
  return string.charAt(0).toUpperCase() + string.slice(1);
}

module.exports = EmberMigrator;
