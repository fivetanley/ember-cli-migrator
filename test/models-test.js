var assert = require('chai').assert;
var path = require('path');
var fs = require('fs');
var helper = require('./test_helper');
var migrates = helper.migrates;
var it = helper.it;
var fs = require('fs');

describe('migrating models', function(){
  before(function(){
    this.migrator = helper.migrator({inputFixtures: 'vanilla'});
    this.migrator.run();
  });

  after(function(){
    this.migrator.clean();
  });

  describe('single export file (only has one global)', function(){
    it(migrates('models/comment-activity.js'));
  });

  describe('Extending model classes', function(){
    it(migrates('models/extended-comment-activity.js'));
  });

  describe('Works with files with no imports', function(){
    it(migrates('models/no-import.js'));
  });

  describe('Works with Em', function(){
    it(migrates('models/comment-activity-with-em.js'));
  });

  describe('Works with Ember Data', function(){
    it(migrates('models/comment-activity-with-ds.js'));
  });

  describe('Works with serializers', function(){
    it(migrates('serializers/comment-activity.js'));
  });

  describe('Works with models and serializers in the same file', function(){
    it(migrates('models/user.js'));
    it(migrates('serializers/user.js'));
  });

  describe('Works with files which reopen existing classes multiple times', function(){
    it(migrates('models/comment-activity.js'));
  });

  describe('Works with simple views', function(){
    it(migrates('views/comment-activity.js'));
  });

  describe('Works with simple controllers', function(){
    it(migrates('controllers/comment-activity.js'));
  });

  describe('Works with simple mixins', function(){
    it(migrates('mixins/useful.js'));
  });

  describe('Works with known types inside unknown type folders', function(){
    it(migrates('mixins/known-type.js'));
  });

  describe('Works with unknown types inside unknown type folders', function(){
    it(migrates('unknown_type/misc.js'));
  });

  describe('Works with unkown types on root app directory', function(){
    it(migrates('router.js'));
  });

  describe('Works with application file', function(){
    it(migrates('application.js'));
  });

  describe('Works with duplicate file names', function(){
    it(migrates('views/duplicate-name.js'));
    it(migrates('views/duplicate-name-x.js'));
    it(migrates('views/some-unknown-type.js'));
    it(migrates('views/use-duplicates.js'));
  });

  describe('Works with transforms', function(){
    it(migrates('transforms/object.js'));
  });

  describe('Works with components', function(){
    it(migrates('components/kiwi-phone.js'));
  });

  describe('Works with servies', function(){
    it(migrates('services/seattle-alert.js'));
  });

  describe('Works with adapters', function(){
    it(migrates('adapters/application.js'));

    it('does not copy the store', function(){
      var file = path.join(this.migrator.outputDirectory, 'my-app', 'store.js');
      assert(!fs.existsSync(file), 'store.js should not exist');
    });
  });

  describe('Works with dasherized unknown type filenames', function(){
    it(migrates('unknown_type/misc-long-name.js'));
  });

  describe('Copies nonjs files to nonjs directory', function(){
    it(migrates('nonjs/mixins/coffee_mixin.js.coffee'));
    it(migrates('nonjs/models/comment_activity_should_ignore.js.erb'));
  });

  describe('Copies templates to templates dir', function(){
    it(migrates('templates/atemplate.handlebars'));
    it(migrates('templates/components/anothertemplate.hbs'));
    it(migrates('templates/views/should_be_in_templates.handlebars'));
  });

  describe('Handles reopen in same file', function(){
    it(migrates('views/reopen.js'));
  });

  describe('Copies routes correctly', function(){
    it(migrates('routes/index.js'));
  });

  describe('Preserve comments', function(){
    it(migrates('controllers/preserve-comments.js'));
  });

  describe('Works with multiple assignments per line', function(){
    it(migrates('routes/one.js'));
    it(migrates('routes/two.js'));
  });

  describe('Can mix-in mixins', function(){
    it(migrates('controllers/with-mixin.js'));
  });

});
