var recast = require('recast');
var Visitor = recast.Visitor;
var builders = recast.types.builders;
var namedTypes = recast.types.namedTypes;

// Find the helper name
// Take the function out and rename it
// Ember.Handlebars.helper('prettyPrint', function(){
//
// })
//
// becomes
//
// function prettyPrint(){
//
// }
//
// then add the export default Ember.Handlebars.makeBoundHelper
//
// then dasherize the file

// 1st pass: find functions
// 2nd pass: remove Ember.Handlebars.helper statement;
// 3rd pass: add `import Ember` and export default and write;

var HelperVisitor = Visitor.extend({
  visitCallExpression: function(node){
    this.__setupResultsArray();
    var callee       = node.callee;
    var objectName   = callee.object.object.name;
    var secondName   = callee.object.property.name;
    var helperName   = node.arguments[0].value;
    var functionBody = node.arguments[1];

    // Extract the helper
    if (objectName === 'Ember' &&  secondName === 'Handlebars') {
      this.results.push({
        helperName: helperName,
        functionBody: functionBody
      });
      return this.genericVisit(builders.emptyStatement());
    }

    // no helper, return the original code
    return this.genericVisit(node);
  },

  __setupResultsArray: function(){
    if (!this.results) {
      this.results = [];
    }
  }
});

module.exports = HelperVisitor;
