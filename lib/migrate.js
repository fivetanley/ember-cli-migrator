#!/usr/bin/env node

/**
 * Module dependencies.
 */

var program = require('commander');
var EmberMigrator = require('./ember-migrator');
var path = require('path');

program
  .version('0.0.1')
  //.option('-p, --peppers', 'Add peppers')
  .parse(process.argv);

var curDir = './';
var tmpDir = path.join(curDir, "/tmp");
var migrator = new EmberMigrator({
  inputDirectory: curDir,
  outputDirectory: tmpDir,
  appName: 'my-app'
});

migrator.run();
