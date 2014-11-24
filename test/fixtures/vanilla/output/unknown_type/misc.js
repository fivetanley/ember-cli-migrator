import Ember from "ember";

var Misc = Ember.Object.extend({
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});

export default Misc;
