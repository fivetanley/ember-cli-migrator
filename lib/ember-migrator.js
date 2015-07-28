var walk = require('walk-sync');
var path = require('path');
var mkdirp = require('mkdirp');
var recast = require('recast');
var string = require('underscore.string');
var fs = require('fs');
var TypedExport = require('./typed-export');
//var HelperVisitor = require('./helper-visitor');
var execSync = require('child_process').execSync;
var UI = require('ember-cli/lib/ui');
var MigratorVisitor = require('./migrator-visitor');
var namedTypes = recast.types.namedTypes;
var builders = recast.types.builders;
var chalk = require('chalk');
var lodash = require('lodash');

// Recast helpers

function EmberMigrator(options){
  this.testing = options.testing || false;
  // Directory to process
  this.inputDirectory = options.inputDirectory;
  // Where we will place the ember-cli app
  this.outputDirectory  = options.outputDirectory + '/app';
  // If git mv is forced
  this.gitMv = options.forceOutput ? "git mv -f " : "git mv ";
  // Global app name used in input files
  this.rootAppName = options.rootAppName || 'App';
  // Our ember-cli app name
  this.appName = options.appName || 'app';
  // The first phase of our app will split files this map contains filenames as
  // keys and array of asts as values
  this.splitFiles = Object.create(null);
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
  this.ui = new UI({
    inputStream: process.stdin,
    outputStream: process.stdout
  });
}


EmberMigrator.prototype = Object.create(null);

EmberMigrator.prototype.run = function EmberMigrator_run(){
  var self = this;
  var files = walk(this.inputDirectory);
  var jsFiles = [];
  var nonJsFiles = [];
  var hbsFiles = [];

  // Here is where we control what files we will process in the input directory
  files.forEach(function (file) {
    var fullPath = path.join(self.inputDirectory, file);
    var isDir = fs.lstatSync(fullPath).isDirectory();
    var isJS = string.endsWith(file, '.js');
    var isHbs = string.endsWith(file, '.handlebars') || string.endsWith(file, '.hbs');
    if (!isDir) {
      if (isJS) {
        jsFiles.push(file);
      } else if (isHbs) {
        hbsFiles.push(file);
      } else {
        nonJsFiles.push(file);
      }
    }
  });

  //We do a two pass transpiling process:
  //1. Split files based on classes, only one per file allowed and create import map
  //2. Now that we know all the possible imports, actually process the files and rewrite them

  // TODO(Tony) make more functional and return outputs
  this.writeLine(chalk.blue('Preprocessing files'));
  jsFiles.forEach(this.splitFile.bind(this));

  Object.keys(this.splitFiles).forEach(function(key) {
    var file = self.splitFiles[key];
    if(fs.existsSync(file.oldFileName)) {
      var folder = file.outputFolderPath();
      mkdirp.sync(folder);
      var outputPath = file.outputFilePath();

      if (outputPath !== file.oldFileName && !this.testing) {
        this.writeLine(chalk.green('Git Move') + ' Moving ' + file.oldFileName + ' to ' + outputPath);
        execSync(this.gitMv + file.oldFileName + " " + outputPath);
      }
    }
  }, this);

  hbsFiles.forEach(function (filePath) {
    var fullPath = path.join(self.inputDirectory, filePath);
    var dirs = filePath.split('/');
    if (dirs[0] !== 'templates') {
      // Make sure we go to templates dir and otherwise keep subdir placement
      dirs.unshift('templates');
    }
    var outputFile = string.dasherize(dirs.join('/'));
    outputFile = path.join(self.outputDirectory, outputFile);
    var outputFolder = path.dirname(outputFile);
    if (fullPath === outputFile) {
      this.writeLine(chalk.green('No Change or Move ') + fullPath );
    }
    else if (this.testing) {
      mkdirp.sync(outputFolder);
      fs.writeFileSync(outputFile, fs.readFileSync(fullPath).toString());
    }
    else if (!this.testing) {
      this.writeLine(chalk.green('Git Move') + ' Moving ' + filePath + ' to ' + outputFile);
      mkdirp.sync(outputFolder);
      execSync(this.gitMv + fullPath + " " + outputFile);
    }
  }, this);

  var unknownNonJsFiles = [];

  nonJsFiles.forEach(function (filePath) {
    var fullPath = path.join(self.inputDirectory, filePath);
    var outputFile;

    if (string.endsWith(filePath, '.gitkeep')) {
      outputFile = path.join(self.outputDirectory, string.dasherize(filePath));
      if (fullPath !== outputFile) {
        this.writeLine(chalk.green('No Change or Move') + ' ' + fullPath);
        execSync(this.gitMv + fullPath + " " + outputFile);
        return;
      }
    } else {
      outputFile = path.join(self.outputDirectory, 'nonjs', string.dasherize(filePath));
    }
    var outputFolder = path.dirname(outputFile);
    if (fullPath === outputFile) {
      this.writeLine(chalk.green('No Change or Move') + ' ' + fullPath );
    } else {
      unknownNonJsFiles.push([outputFile, outputFolder, fullPath]);
    }
  }, this);

  unknownNonJsFiles.forEach(function(data) {
    var outputFile = data[0];
    var outputFolder = data[1];
    var fullPath = data[2];

    this.writeLine(chalk.yellow('Copying Unknown File') + ' ' + fullPath);
    mkdirp.sync(outputFolder);
      fs.writeFileSync(outputFile, fs.readFileSync(fullPath));
  }, this);

  if (!this.testing) {
    execSync("git commit -m \"auto-commit from ember-cli-migrator\"");
  }
  Object.keys(this.splitFiles).forEach(function(key) {
    self.processFile(self.splitFiles[key]);
  });

  console.log('flush');
  this.flushConvertedFiles(this.splitFiles);

  if (!this.testing) {
    execSync("git add  " + this.outputDirectory);
  }
};

EmberMigrator.prototype.writeLine = function(message){
  if (!this.testing) {
    return this.ui.writeLine.apply(this.ui, arguments);
  }
}

EmberMigrator.prototype.splitFile = function(filePath) {
  var file = fs.readFileSync(path.join(this.inputDirectory, filePath)).toString();
  var oldFilePath = path.join(this.inputDirectory, filePath);
  try {
    var ast = recast.parse(file);
  } catch (e) {
    this.writeLine(chalk.red('Failed to parse ' + filePath));
    if ( filePath.indexOf("node_modules") || filePath.indexOf("bower_components") ) {
      this.writeLine(chalk.yellow("Note that you probably don't want to run the migrator against your npm or bower dependencies. Make sure that the directory you've specified in the '--source' flag only contains your application code."));
    }
    this.writeLine(chalk.grey(e));
  }
  var astBody = ast.program.body;
  // Cache of ast nodes that are not directly exported so need to be appended
  // at the end of the splitting process
  var nonExportNodes = [];
  // Keep track of exports we have split this file into
  var typedExports = [];
  // For some reason the first nodes leading comments are separated from the node
  var firstNodeComments = ast.program.comments;

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
        exportName: className,
        oldFileName: oldFilePath,
        appName: that.appName
      });
      that.splitFiles[fileName] = typedExport;
      // Every typed export needs to be able to be looked up on this map
      that.classesFilepathMap[typedExport.exportName] = {
        moduleName: typedExport.exportPath(that.appName),
        isWindow: isWindow
      };
      typedExports.push(typedExport);
    }
    that.splitFiles[fileName].astNodes.push(node);
  };

  function extractHelpers(astBody){
    var visitor = new HelperVisitor();
    visitor.visit(astBody);
    if (visitor.results.length === 1) {
      console.log('YAY!')
    }
  }

  // Helper function to take mutliple expressions, e.g., var A = B = C,
  // which is represented by a tree of depth 3 and turn that into two trees
  // of depth 2, i.e., two assignment expressions.
  //
  // Input: {expression: { name: A, right: { name: B, right: { name: C}}}}, []
  //
  // Output: [{expression: {name: A, right: {name: C}}}, {expression: {name: B, right: {name: C}}}]
  //
  // TODO might want to clean this up and make less sloppy with copies, but
  // this also happens very rarely so might not matter
  function flattenMultiExpression(node, flattenedNodes) {
    // Assume node is an assignment expression
    var rightNode = node.expression.right;
    if (namedTypes.AssignmentExpression.check(rightNode)) {
      // Right node is also an assignment expression so we need to flatten it, and
      // we want to keep the same expression oject structure for the node
      var newNode = lodash.cloneDeep(node);
      newNode.expression = rightNode;
      flattenMultiExpression(newNode, flattenedNodes);
      // Copy the rightNode assignment
      var cloneValue = lodash.cloneDeep(newNode.expression.right);
      // And now flatten ourselves, i.e., set our right side = to the value
      // at the end of the assignment chain
      node.expression.right = cloneValue;
    }
    // I've been flattened so I can go in the list
    flattenedNodes.unshift(node);
  }

  astBody.forEach(function(node, index) {
    var isNodeStored = false;
    var className;

    if (index === 0 && firstNodeComments) {
      node.comments = firstNodeComments;
    }

    if (namedTypes.ExpressionStatement.check(node) &&
        namedTypes.AssignmentExpression.check(node.expression)) {

      // Let's get all the assignments in case of multi-assignments
      // E.g., var App.One = var App.Two = Ember.Object.extend
      // TODO This currently won't handle non-export multi-assingments,
      // e.g. var App.One = var Two = Ember.Object.extend, the Two will disappear
      var flattenedNodes = [];
      flattenMultiExpression(node, flattenedNodes);

      flattenedNodes.forEach(function(flatNode) {
        // We know we are an assignment
        var expression = flatNode.expression;
        if (namedTypes.MemberExpression.check(expression.left) &&
            (expression.left.object.name === this.rootAppName ||
            expression.left.object.name === "window")) {

          // See if we are assigning the class on the App or window
          var isWindow = expression.left.object.name === "window";
          className = expression.left.property.name;
          addTypedNode(flatNode, filePath, className, isWindow);
          isNodeStored = true;
        }
      }.bind(this));

      // Check to see if the expression is a commonjs export
      if (namedTypes.AssignmentExpression.check(node.expression) &&
          node.expression.left.object &&
          node.expression.left.object.name === 'module' &&
          node.expression.left.property.name === 'exports') {
        if(namedTypes.Identifier.check(node.expression.right)){
          addTypedNode(node, filePath, node.expression.right.name, false);
          isNodeStored = true;
        }
      }

    }

    if (!isNodeStored) {
      // Any other code that is not a global class assignment on root app will
      // be remembered and at the end of splitting we will append these to the
      // first typedExport or create a new typed export if none was created
      nonExportNodes.push(node);
    }
  }, this);


  // Append any remaining non-export nodes to either first export or new export
  nonExportNodes.forEach(function (node) {
    if (typedExports.length === 0) {
      var newFilePath = string.dasherize(filePath);
      addTypedNode(node, newFilePath);
    } else {
      typedExports[0].astNodes.push(node);
    }
  });
};

EmberMigrator.prototype.processFile = function(typedExport){
  typedExport.convertedFile = this.convertFile(typedExport);
};

EmberMigrator.prototype.convertFile = function(typedExport){
  var visitor = new MigratorVisitor({
    localAppName: this.appName,
    rootAppName: this.rootAppName,
    classesFilepathMap: this.classesFilepathMap,
    outputDirectory: this.outputDirectory
  });
  visitor.visit(typedExport.astNodes);
  var imports = Object.keys(visitor.imports)
    // Do not import the module we are exporting
    .filter(function (key) {
      return key !== typedExport.exportName;
    })
    .map(function(key){
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

  // for some reason there is a rogue semicolon
  code = code.replace(/\n;\n/, '\n');
  
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
    var folder = typedExport.outputFolderPath();
    mkdirp.sync(folder);
    fs.writeFileSync(typedExport.outputFilePath(), typedExport.convertedFile);
  }, this);
};


function capitalize(string){
  return string.charAt(0).toUpperCase() + string.slice(1);
}

module.exports = EmberMigrator;
