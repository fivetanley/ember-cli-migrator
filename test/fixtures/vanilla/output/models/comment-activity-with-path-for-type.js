import Ember from "ember";

var CommentActivityWithPathForType = Ember.Object.extend({
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});
CommentActivityWithPathForType.pathForType = "Hello";

export default CommentActivityWithPathForType;
