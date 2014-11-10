var walk = require('walk-sync');
var path = require('path');
var mkdirp = require('mkdirp');
var recast = require('recast');
var string = require('underscore.string');
var fs = require('fs');
var types = recast.types;
var builders = types.builders;

var namedTypes = types.namedTypes;

function EmberMigrator(options){
  this.inputDirectory = options.inputDirectory;
  this.outputDirectory  = options.outputDirectory;
  this.rootAppName = options.rootAppName || 'App';
  this.appName = options.appName;
  this.convertedFiles = {
    model: Object.create(null),
    serializer: Object.create(null),
  };
  this.splitFiles = {
    model: Object.create(null),
    serializer: Object.create(null),
  };
  this.filepathTypeMap = Object.create(null);
  this.classesFilepathMap = Object.create(null);
  this.initFolderPaths();
}

var Visitor = recast.Visitor;

var MigratorVisitor = Visitor.extend({
  init: function(options) {
    this.rootAppName = options.rootAppName;
    this.classesFilepathMap = options.classesFilepathMap;
    this.filepathTypeMap = options.filepathTypeMap;
    this.imports = {};
  },
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
  },

  visitMemberExpression: function(node){
    var isExpression = namedTypes.MemberExpression.check(node) && node.object.object
    if (isExpression && (node.object.object.name === "Ember" || node.object.object.name === "Em")){
      this.imports["Ember"] = 'Ember';
    } else if (isExpression && node.object.object.name === "DS") {
      this.imports["DS"] = 'ember-data';
    } else if (isExpression && node.object.object.name === this.rootAppName){
      var name = node.object.property.name;
      if (this.classesFilepathMap[name]) {
        this.imports[name] = this.classesFilepathMap[name];
      }
    }
    return node;
  },

});

EmberMigrator.prototype = Object.create(null);

EmberMigrator.prototype.run = function EmberMigrator_run(){
  var self = this;
  var files = walk(this.inputDirectory);
  files = files.filter(function(file){
    var fullPath = path.join(self.inputDirectory, file);
    return !fs.lstatSync(fullPath).isDirectory();
  });

  //We do a two pass transpiling process:
  //1. First figure out all the new file and class names
  //2. Now that we know all the possible imports, actually process the files and rewrite them
  files.forEach(this.splitFile.bind(this));
  //this.flushSplitFiles();
  files.forEach(this.preProcessFile.bind(this));
  files.forEach(this.processFile.bind(this));
  this.flushConvertedFiles();
};

EmberMigrator.prototype.initFolderPaths = function() {
  this.modelFolderPath = path.join(this.outputDirectory, 'app/models');
  this.serializerFolderPath = path.join(this.outputDirectory, 'app/serializers');
};

EmberMigrator.prototype.processFile = function(file){
  var type = determineType(path.dirname(file));
  this.addFile(file, type);
};

//Needs to support one file exporting multiple classes
EmberMigrator.prototype.preProcessFile = function(filePath) {
  //Duplicate functionality, should refactor
  var fileName = path.basename(filePath);
  filePath = path.join(this.inputDirectory, filePath);
  var ast = recast.parse(fs.readFileSync(filePath).toString());
  var visitor = new MigratorVisitor({rootAppName: this.rootAppName, classesFilepathMap:this.classesFilepathMap});
  visitor.visit(ast);
  var exportName = visitor._exportName;

  var type = this.filepathTypeMap[filePath] = determineType(filePath, visitor._exportName);

  // Figure out from either path of input or exportName what the type is
  if (type === 'model') {
    this.classesFilepathMap[exportName] = '/' +  this.appName + '/models/' + fileName;
  } else if (type === 'serializer') {
    this.classesFilepathMap[exportName] = '/' +  this.appName + '/serializers/' + fileName;
  }
};

EmberMigrator.prototype.splitFile = function(filePath) {
  var fileName = path.basename(filePath);
  filePath = path.join(this.inputDirectory, filePath);
  var ast = recast.parse(fs.readFileSync(filePath).toString());
  var astBody = ast.program.body
  var logBody = astBody.length > 1;
  var assignmentCount = 0;

  var type = determineType(filePath);
  this.splitFiles[type][fileName] = []
  astBody.forEach(function(node) {
    var isNodeStored = false;
    if (namedTypes.ExpressionStatement.check(node)) {
      var expression = node.expression;
      if (namedTypes.AssignmentExpression.check(expression) &&
          namedTypes.MemberExpression.check(expression.left) &&
          expression.left.object.name === this.rootAppName) {
        var className = expression.left.property.name;
        if (assignmentCount > 0) {
          var newType = determineType(filePath, className);
          this.splitFiles[newType][className] = [node]
        } else {
          this.splitFiles[type][fileName].push(node);
        }
        isNodeStored = true;
        assignmentCount++;
      }
    }

    if (!isNodeStored) {
      // place all other nodes in the main file
      this.splitFiles[type][fileName].push(node);
    }
  }, this);

  if (logBody) {
    console.log('split files: ', this.splitFiles);
  }

};

EmberMigrator.prototype.addFile = function(filePath, type){
  var fileName = path.basename(filePath);
  filePath = path.join(this.inputDirectory, filePath);
  this.convertedFiles[type][fileName] = this.convertFile(fileName, filePath, type);
};

EmberMigrator.prototype.convertFile = function(modelName, filePath, type){
  var ast = recast.parse(fs.readFileSync(filePath).toString());
  var visitor = new MigratorVisitor({rootAppName: this.rootAppName, classesFilepathMap:this.classesFilepathMap});
  visitor.visit(ast);
  var imports = Object.keys(visitor.imports).map(function(key){
    var importFilename = string.dasherize(visitor.imports[key]).toLowerCase();
    //If the key started with a capital letter, we want to strip the leading '-'
    if (importFilename[0] === '-') {
      importFilename = importFilename.substring(1);
    }
    return "import " + key + " from \"" + importFilename + '";';
  }).join("\n");

  imports = imports.replace('.js', '');

  //Add two blank lines below imports if we have imports
  if (imports.length > 0) {
    imports = imports + "\n\n";
  }
  var code = imports + recast.print(ast).code;
  code = code.replace(/;;\n+/g, ';\n'); // for some reason recast print will add another semicolon if there is already one
  code = code.replace(this.rootAppName + '.', '');
  code = code.replace('Em.', 'Ember.');

  return code  + "\n" + "export default " + visitor._exportName + ";\n";
};

EmberMigrator.prototype.pathForModel = function(modelName){
  return path.join(this.modelFolderPath, string.dasherize(modelName));
};

EmberMigrator.prototype.pathForSerializer = function(serializerName){
  return path.join(this.serializerFolderPath, string.dasherize(serializerName));
};

EmberMigrator.prototype.pathForFile = function(fileName, type){
  if (type === 'model') {
    return this.pathForModel(fileName);
  } else if (type === 'serializer') {
    return this.pathForSerializer(fileName);
  } else {
    console.log("Don't understand type " + type);
  }
};

EmberMigrator.prototype.pathForSplitFile = function(fileName, type){
  if (type === 'model') {
    return this.pathForModel(fileName);
  } else if (type === 'serializer') {
    return this.pathForSerializer(fileName);
  } else {
    console.log("Don't understand type " + type);
  }
};

EmberMigrator.prototype.flushSplitFiles = function(){
  mkdirp.sync(this.modelFolderPath);
  mkdirp.sync(this.serializerFolderPath);

  Object.keys(this.splitFiles).forEach(function(type){
    Object.keys(this.splitFiles[type]).forEach(function(fileName){
      var fileContent = this.splitFiles[type][fileName];
      console.log('split file path: ', this.pathForSplitFile(fileName, type));
      //fs.writeFileSync(this.pathForSplitFile(fileName, type), fileContent);
    }, this);
  }, this);
};

EmberMigrator.prototype.flushConvertedFiles = function(){
  mkdirp.sync(this.modelFolderPath);
  mkdirp.sync(this.serializerFolderPath);

  Object.keys(this.convertedFiles).forEach(function(type){
    Object.keys(this.convertedFiles[type]).forEach(function(fileName){
      var fileContent = this.convertedFiles[type][fileName];
      fs.writeFileSync(this.pathForFile(fileName, type), fileContent);
    }, this);
  }, this);
};

var MODEL_PATH = /models/;
var SERIALIZERS_PATH = /serializers/;

function determineType(filePath, className){
  if (MODEL_PATH.test(filePath)) {
    return 'model';
  } else if (SERIALIZERS_PATH.test(filePath)) {
    return 'serializer';
  }
}

function capitalize(string){
  return string.charAt(0).toUpperCase() + string.slice(1);
}

module.exports = EmberMigrator;
