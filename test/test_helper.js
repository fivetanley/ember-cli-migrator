var rimraf = require('rimraf');
var path = require('path');
var EmberMigrator = require('../lib/ember-migrator');
var fs = require('fs');
var inflector = require('underscore.string');
var assert = require('chai').assert;
var _ = require('lodash');

var tmpDir = path.join(__dirname, "../tmp");

function migrator(options) {
  var defaults = {
    inputDirectory: path.join(__dirname, "fixtures/" + options.inputFixtures + '/input'),
    outputDirectory: tmpDir,
    appName: 'my-app',
    testing: true
  };
  var opts = _.extend({}, defaults, options);

  var migrator = new EmberMigrator(opts);

  migrator.expectedOutputFixtureDirectory = path.join(__dirname, "fixtures/", opts.inputFixtures, '/output');
  migrator.clean = function(){
    rimraf.sync(tmpDir);
  }
  return migrator;
}

function migratorResult(migrator, fixtureName){
  var file = path.join(migrator.outputDirectory, fixtureName);
  return fs.readFileSync(file).toString().split('\n');;
}

function fixture(migrator, fixtureName){
  var outDir = path.join(migrator.expectedOutputFixtureDirectory, fixtureName);
  return fs.readFileSync(outDir).toString().split('\n');
}

function migratesCorrectly(inputFileName, outputFileName) {
  outputFileName = outputFileName || inflector.dasherize(inputFileName);
  var spec = function(){
    var migrator = this.migrator;
    var underscored = inflector.underscored(inputFileName);
    var expected = fixture(migrator, outputFileName);
    var actual  = migratorResult(migrator, inflector.dasherize(inputFileName));
    assert.deepEqual(actual, expected);
  };
  return ['migrates ' + inputFileName + ' correctly', spec];
}

module.exports = migrator;
module.exports.migrator = migrator;
module.exports.migrates = migratesCorrectly;

module.exports.it = function(result){
  if (!Array.isArray(result)) {
    return it(result, arguments[1]);
  }
  return it(result[0], result[1]);
}

module.exports.it.only = function(result){
  if (!Array.isArray(result)) {
    return it.only(result, arguments[1]);
  }
  return it.only(result[0], result[1]);
};
