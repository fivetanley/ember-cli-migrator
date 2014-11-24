App.CommentActivityWithPathForType = Ember.Object.extend({
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});

App.CommentActivityWithPathForType.pathForType = "Hello";
