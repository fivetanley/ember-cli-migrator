var assert = require('chai').assert;
var EmberMigrator = require('../lib/ember-migrator');
var path = require('path');
var fs = require('fs');
var rimraf = require('rimraf');

describe('migrating models', function(){
  function fixture(fixtureName){
    var outDir = path.join(__dirname, "fixtures/vanilla/output", fixtureName);
    return fs.readFileSync(outDir).toString();
  }
  function result(fixtureName){
    var file = path.join(tmpDir, 'app', fixtureName);
    return fs.readFileSync(file).toString();
  }
  var migrator;
  var tmpDir = path.join(__dirname, "../tmp");
  before(function(){
    migrator = new EmberMigrator({
      inputDirectory: path.join(__dirname, "fixtures/vanilla/input/"),
      outputDirectory: tmpDir,
      appName: 'my-app'
    });
    return migrator.run();
  });

  after(function(){
    rimraf.sync(tmpDir);
  });

  describe('single export file (only has one global)', function(){

    it('migrates the file correctly', function(){

      var expected = fixture('models/comment-activity.js').split('\n');
      var actual  = result('models/comment-activity.js').split('\n');
      assert.deepEqual(actual, expected);
    });
  });

  describe('Extending model classes', function(){

    it('migrates the file correctly', function(){

      var expected = fixture('models/extended-comment-activity.js').split('\n');
      var actual  = result('models/extended-comment-activity.js').split('\n');
      assert.deepEqual(actual, expected);
    });
  });

  describe('Works with files with no imports', function(){

    it('migrates the file correctly', function(){

      var expected = fixture('models/no-import.js').split('\n');
      var actual  = result('models/no-import.js').split('\n');
      assert.deepEqual(actual, expected);
    });
  });

  describe('Works with Em', function(){

    it('migrates the file correctly', function(){

      var expected = fixture('models/comment-activity-with-em.js').split('\n');
      var actual  = result('models/comment-activity-with-em.js').split('\n');
      assert.deepEqual(actual, expected);
    });
  });

  describe('Works with Ember Data', function(){

    it('migrates the file correctly', function(){

      var expected = fixture('models/comment-activity-with-ds.js').split('\n');
      var actual  = result('models/comment-activity-with-ds.js').split('\n');
      assert.deepEqual(actual, expected);
    });
  });

});
