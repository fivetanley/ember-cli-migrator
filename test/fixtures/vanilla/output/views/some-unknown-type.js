import Ember from 'ember';

var SomeUnknownType = Ember.Object.extend({
  helloAgain: function() {
    console.log('hello');
  }
});

export default SomeUnknownType;
