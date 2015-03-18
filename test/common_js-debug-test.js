var assert = require('chai').assert;
var path = require('path');
var fs = require('fs');
var helper = require('./test_helper');
var migrates = helper.migrates;
var it = helper.it;
var fs = require('fs');

describe('migrating commonjs', function(){
  before(function(){
    this.migrator = helper.migrator({inputFixtures: 'common_js'});
    this.migrator.run();
  });

  after(function(){
    this.migrator.clean();
  });

  describe('Works with controllers with dependencies', function(){
    it(migrates('controllers/with-mixin.js'));
  });

});
