import Ember from 'ember';

var CommentActivityWithEm = Ember.Object.extend({
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});

export default CommentActivityWithEm;
