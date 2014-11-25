var walk = require('walk-sync');
var path = require('path');
var mkdirp = require('mkdirp');
var recast = require('recast');
var string = require('underscore.string');
var fs = require('fs');
var TypedExport = require('./typed-export');

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
  this.appName = options.appName || 'app';
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
  this.flushConvertedFiles(this.splitFiles);
};

EmberMigrator.prototype.splitFile = function(filePath) {

  var file = fs.readFileSync(path.join(this.inputDirectory, filePath)).toString();
  console.log('splitting file', path.join(this.inputDirectory, filePath));
  var ast = recast.parse(file);
  var astBody = ast.program.body;
  var logBody = astBody.length > 1;
  var assignmentCount = 0;

  var that = this;
  var addTypedNode = function(node, filePath, className) {
    var newType = TypedExport.determineType(filePath, className);
    var fileName = TypedExport.filePathForClassname(className, newType, filePath);
    if (!that.splitFiles[fileName]) {
      that.splitFiles[fileName] = new TypedExport({
        outputDirectory: that.outputDirectory,
        type: newType,
        fileName: fileName,
        // TODO(Tony) this will be a problem if a non-exporting node is found first, because
        // className will be null
        exportName: className
      });
    }
    that.splitFiles[fileName].astNodes.push(node);
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
          addTypedNode(node, filePath, className);
        } else {

          // This is the first class so it will go to the original filename as default
          addTypedNode(node, filePath, className);
        }
        isNodeStored = true;
        assignmentCount++;
      }
    }
    if (!isNodeStored) {
      // Any other code that is not a global class assignment on root app goes into the
      // original filename
      var newFilePath = string.dasherize(filePath);
      addTypedNode(node, newFilePath);
    }
  }, this);

};

//Needs to support one file exporting multiple classes
EmberMigrator.prototype.preProcessFile = function(filePath, typedExport) {
  // Add an entry to the map between the class in this file and its ember-cli export file
  this.classesFilepathMap[typedExport.exportName] = typedExport.exportPath(this.appName);
};

EmberMigrator.prototype.processFile = function(filePath, typedExport){
  typedExport.convertedFile = this.convertFile(typedExport);
};

EmberMigrator.prototype.convertFile = function(typedExport){
  var visitor = new MigratorVisitor({rootAppName: this.rootAppName, classesFilepathMap: this.classesFilepathMap});
  visitor.visit(typedExport.astNodes);
  var imports = Object.keys(visitor.imports).map(function(key){
    var importFilename = TypedExport.convertToOutputFilename(visitor.imports[key]);
    return "import " + key + " from \"" + importFilename + '";';
  }, this).join("\n");

  imports = imports.replace('.js', '');

  //Add two blank lines below imports if we have imports
  if (imports.length > 0) {
    imports = imports + "\n\n";
  }

  // Convert our ast into string in order to join with imports and do final processing
  var astCode = typedExport.astNodes.map(function(node) { return recast.print(node).code; }).join('\n');
  var code = imports + astCode + '\n';
  code = code.replace(/;;\n+/g, ';\n'); // for some reason recast print will add another semicolon if there is already one
  code = code.replace(this.rootAppName + '.', '');
  code = code.replace('Em.', 'Ember.');
  code = code  + "\n" + "export default " + typedExport.exportName + ";\n";

  return code;
};

EmberMigrator.prototype.flushConvertedFiles = function(splitFiles){
  //Create directory for every path in our app including unknown folders
  Object.keys(splitFiles).forEach(function(file) {
    var typedExport = splitFiles[file];
    var folder = typedExport.outputFolderPath(this.appName);
    console.log('making output folder', folder);
    mkdirp.sync(folder);
    fs.writeFileSync(typedExport.outputFilePath(this.appName), typedExport.convertedFile);
  }, this);
};


function capitalize(string){
  return string.charAt(0).toUpperCase() + string.slice(1);
}

module.exports = EmberMigrator;
