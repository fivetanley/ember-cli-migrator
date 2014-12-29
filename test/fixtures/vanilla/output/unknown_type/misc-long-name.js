import Ember from 'ember';

var MiscLongName = Ember.Object.extend({
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});

export default MiscLongName;
