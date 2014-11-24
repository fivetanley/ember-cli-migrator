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

  describe('Works with serializers', function(){

    it('migrates the file correctly', function(){

      var expected = fixture('serializers/comment-activity.js').split('\n');
      var actual  = result('serializers/comment-activity.js').split('\n');
      assert.deepEqual(actual, expected);
    });
  });

  describe('Works with models and serializers in the same file', function(){

    it('migrates the files correctly', function(){

      var expectedModel = fixture('models/user-model-with-serializer.js').split('\n');
      var actualModel  = result('models/user-model-with-serializer.js').split('\n');
      assert.deepEqual(actualModel, expectedModel);

      var expectedSerializer = fixture('serializers/user.js').split('\n');
      var actualSerializer  = result('serializers/user.js').split('\n');
      assert.deepEqual(actualSerializer, expectedSerializer);
    });
  });

  describe('Works with files which reopen existing classes multiple times', function(){

    it('migrates the files correctly', function(){
      var expectedModel = fixture('models/comment-activity-with-path-for-type.js').split('\n');
      var actualModel  = result('models/comment-activity-with-path-for-type.js').split('\n');
      assert.deepEqual(actualModel, expectedModel);
    });
  });

  describe('Works with simple views', function(){

    it('migrates the files correctly', function(){
      var expectedModel = fixture('views/comment-activity.js').split('\n');
      var actualModel  = result('views/comment-activity.js').split('\n');
      assert.deepEqual(actualModel, expectedModel);
    });
  });

  describe('Works with simple controllers', function(){

    it('migrates the files correctly', function(){
      var expectedModel = fixture('controllers/comment-activity.js').split('\n');
      var actualModel  = result('controllers/comment-activity.js').split('\n');
      assert.deepEqual(actualModel, expectedModel);
    });
  });
});
