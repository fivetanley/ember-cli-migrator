#!/usr/bin/env node

/**
 * Module dependencies.
 */

var program = require('commander');
var EmberMigrator = require('ember-migrator');

program
  .version('0.0.1')
  //.option('-p, --peppers', 'Add peppers')
  .parse(process.argv);

var tmpDir = path.join(__dirname, "../tmp");
var migrator = new EmberMigrator({
  inputDirectory: path.join(__dirname, "fixtures/vanilla/input/"),
  outputDirectory: tmpDir,
  appName: 'my-app'
});

migrator.run();
