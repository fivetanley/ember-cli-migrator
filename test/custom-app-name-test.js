var helper = require('./test_helper');
var it = helper.it;
var migrates = helper.migrates;

describe('custom app name', function(){
  before(function(){
    this.migrator = helper.migrator({
      inputFixtures: 'custom_app_name',
      rootAppName: 'MyApp'
    });
    this.migrator.run();
  });

  after(function(){
    this.migrator.clean();
  });

  describe('single export file', function(){
    it(migrates('models/comment-activity.js'));
  });
});
