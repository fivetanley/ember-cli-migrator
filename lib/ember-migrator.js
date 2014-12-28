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
  this.convertedFiles = Object.create(null);
  // Map from class name to export path in ember-cli
  // E.g., App.MyClassView -> /app/views/my-class.js
  // Also, window.App -> app/app.js
  // We handle the difference between main app space and window simply with isWindowVar flag
  this.classesFilepathMap = Object.create(null);
  // Some things are stored on the window directly, e.g., the main application
  // E.g., window.App -> /app/app.js
  this.windowFilepathMap = Object.create(null);
}

var Visitor = recast.Visitor;

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
      this.imports.Ember = 'Ember';
    } else if (isExpression && node.object.object.name === "DS") {
      // We are using DS namespace so import ember-data
      this.imports.DS = 'ember-data';
    } else if (isExpression && node.object.object.name === this.rootAppName){
      // We are using the global App namespace so we need to import something from our ember-cli structure
      var name = node.object.property.name;
      console.log('name', name);
      if (this.classesFilepathMap[name] == undefined) {
        console.log('splitfiles', Object.keys(this.classesFilepathMap));
      }
      if (this.classesFilepathMap[name].moduleName) {
        this.imports[name] = this.classesFilepathMap[name].moduleName;
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
    if (namedTypes.MemberExpression.check(node.left) &&
        (leftNode.object.name === this.rootAppName ||
         leftNode.object.name === 'window') ){
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

  //We do a two pass transpiling process:
  //1. Split files based on classes, only one per file allowed and create import map
  //2. Now that we know all the possible imports, actually process the files and rewrite them

  // TODO(Tony) make more functional and return outputs
  console.log('preprocess');
  files.forEach(this.splitFile.bind(this));

  console.log('process');
  Object.keys(this.splitFiles).forEach(function(key) {
    self.processFile(self.splitFiles[key]);
  });
  console.log('flush');
  this.flushConvertedFiles(this.splitFiles);
};

EmberMigrator.prototype.splitFile = function(filePath) {
  var file = fs.readFileSync(path.join(this.inputDirectory, filePath)).toString();
  console.log('splitting file', path.join(this.inputDirectory, filePath));
  var ast = recast.parse(file);
  var astBody = ast.program.body;
  var assignmentCount = 0;

  var that = this;
  var addTypedNode = function(node, filePath, className, isWindow) {
    var newType = TypedExport.determineType(filePath, className);
    var fileName = TypedExport.filePathForClassname(className, newType, filePath, that.splitFiles);

    if (!that.splitFiles[fileName]) {
      var typedExport = new TypedExport({
        outputDirectory: that.outputDirectory,
        type: newType,
        fileName: fileName,
        // TODO(Tony) this will be a problem if a non-exporting node is found
        // first, because className will be null
        exportName: className
      });
      that.splitFiles[fileName] = typedExport;
      // Every typed export needs to be able to be looked up on this map
      that.classesFilepathMap[typedExport.exportName] = {
        moduleName: typedExport.exportPath(that.appName),
        isWindow: isWindow
      };
    }
    that.splitFiles[fileName].astNodes.push(node);
  };

  astBody.forEach(function(node) {
    var isNodeStored = false;
    var className;

    if (namedTypes.ExpressionStatement.check(node)) {

      // We know we are an assignment
      var expression = node.expression;
      if (namedTypes.AssignmentExpression.check(expression) &&
          namedTypes.MemberExpression.check(expression.left) &&
          (expression.left.object.name === this.rootAppName ||
          expression.left.object.name === "window")) {

        // See if we are assigning the class on the App or window
        var isWindow = expression.left.object.name === "window";
        className = expression.left.property.name;
        if (assignmentCount > 0) {

          // We have already stored one class into a file so we need to split
          // files and store the class in a new file
          // TODO(Tony): This needs to stay separate from below because the node Needs
          // to be exported therefore in a separate file.
          addTypedNode(node, filePath, className, isWindow);
        } else {

          // This is the first class so it will go to the original filename as default
          addTypedNode(node, filePath, className, isWindow);
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

EmberMigrator.prototype.processFile = function(typedExport){
  typedExport.convertedFile = this.convertFile(typedExport);
};

EmberMigrator.prototype.convertFile = function(typedExport){
  var visitor = new MigratorVisitor({rootAppName: this.rootAppName, classesFilepathMap: this.classesFilepathMap});
  //console.log('typedExport', typedExport);
  visitor.visit(typedExport.astNodes);
  var imports = Object.keys(visitor.imports).map(function(key){
    var importFilename = TypedExport.convertToOutputFilename(visitor.imports[key]);
    return 'import ' + key + ' from \'' + importFilename + '\';';
  }, this).join("\n");

  imports = imports.replace(/\.js/g, '');

  //Add two blank lines below imports if we have imports
  if (imports.length > 0) {
    imports = imports + "\n\n";
  }

  // Convert our ast into string in order to join with imports and do final processing
  var astCode = typedExport.astNodes.map(function(node) { return recast.print(node).code; }).join('\n');
  var code = imports + astCode + '\n';
  code = code.replace(/;;\n+/g, ';\n'); // for some reason recast print will add another semicolon if there is already one
  code = code.replace(new RegExp(this.rootAppName + "\\.", 'g'), '');
  code = code.replace(/Em\./g, 'Ember.');
  // For any module imported that used to be a window global
  Object.keys(this.classesFilepathMap).forEach(function(name) {
    var module = this.classesFilepathMap[name];
    if (module.isWindow) {
      code = code.replace("window." + name, name);
    }
  }, this);


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
