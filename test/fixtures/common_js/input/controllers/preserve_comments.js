/* Some global block
 * comment on multiple lines.
 */

// A global comment
var PreserveCommentsController = Ember.ObjectController.extend({
  // A comment on a property
  someControllerProperty: 'props',
  aMethod: function() {
    // A comment within a method
    console.log('hello');
  }
});

module.exports = PreserveCommentsController;
