import Ember from "ember";

var CommentActivity = Ember.Object.extend({
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});

export default CommentActivity;
