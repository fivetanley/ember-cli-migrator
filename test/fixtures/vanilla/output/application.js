import Ember from "ember";

var App = Ember.Application.extend({
  someProperty: function() {
    console.log('hello App');
  }
});

export default App;
