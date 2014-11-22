App.User = Ember.Object.extend({
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});

App.UserSerializer = DS.Serializer.extend({
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});
