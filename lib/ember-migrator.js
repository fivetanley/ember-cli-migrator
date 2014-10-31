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
  this.models = {};
  this.initFolderPaths();
}



var Visitor = recast.Visitor;

var MigratorVisitor = Visitor.extend({
  init: function(options) {
    this.rootAppName = options.rootAppName;
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
    if (namedTypes.MemberExpression.check(node) && node.object.object && node.object.object.name === "Ember"){
      this.imports["Ember"] = true;
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
  //files.forEach(this.preProcessFile.bind(this));
  files.forEach(this.processFile.bind(this));
  this.flush();
};

EmberMigrator.prototype.initFolderPaths = function() {
  this.modelFolderPath = path.join(this.outputDirectory, 'app/models');
};

EmberMigrator.prototype.processFile = function(file){
  var type = determineType(path.dirname(file));
  this['add' + capitalize(type)](file);
};

EmberMigrator.prototype.addModel = function(filePath){
  var modelName = path.basename(filePath);
  filePath = path.join(this.inputDirectory, filePath);
  this.models[modelName] = this.convertModel(modelName, filePath);
};

EmberMigrator.prototype.convertModel = function(modelName, filePath){
  var ast = recast.parse(fs.readFileSync(filePath).toString());
  var visitor = new MigratorVisitor({rootAppName: this.rootAppName});
  visitor.visit(ast);
  var imports = Object.keys(visitor.imports).map(function(key){
    return "import " + key + " from \"" + key.toLowerCase() + '";';
  }).join("\n");
  //Add two blank lines below imports if we have imports
  if (imports.length > 0) {
    imports = imports + "\n\n";
  }
  var code = imports + recast.print(ast).code;
  code = code.replace(/;;\n+/g, ';\n'); // for some reason recast print will add another semicolon if there is already one

  return code  + "\n" + "export default " + visitor._exportName + ";\n";
};

EmberMigrator.prototype.pathForModel = function(modelName){
  return path.join(this.modelFolderPath, string.dasherize(modelName));
};

EmberMigrator.prototype.flush = function(){
  mkdirp.sync(this.modelFolderPath);
  Object.keys(this.models).forEach(function(modelName){
    var modelContent = this.models[modelName];
    fs.writeFileSync(this.pathForModel(modelName), modelContent);
  }, this);

};

var MODEL_PATH = /models/;

function determineType(filePath){
  if (MODEL_PATH.test(filePath)) return 'model';
}

function capitalize(string){
  return string.charAt(0).toUpperCase() + string.slice(1);
}

module.exports = EmberMigrator;
