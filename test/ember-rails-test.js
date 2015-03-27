var assert = require('chai').assert;
var path = require('path');
var fs = require('fs');
var helper = require('./test_helper');
var migrates = helper.migrates;
var it = helper.it;
var fs = require('fs');

describe('migrating ember-rails', function(){
  before(function(){
    this.migrator = helper.migrator({inputFixtures: 'ember-rails'});
    this.migrator.run();
  });

  after(function(){
    this.migrator.clean();
  });

  describe('Works with application file', function(){
    it(migrates('application.js'));
  });

});
