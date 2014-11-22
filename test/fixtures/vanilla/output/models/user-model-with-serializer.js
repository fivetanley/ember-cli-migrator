import Ember from "ember";

var User = Ember.Object.extend({
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});

export default User;
