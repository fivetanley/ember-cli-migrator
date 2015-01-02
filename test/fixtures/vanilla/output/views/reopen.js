import Ember from 'ember';

var ReopenView = Ember.View.extend({
  hello: function () {
    console.log('hello');
  }
});
ReopenView.reopen({
  helloAgain: function () {
    console.log('hi');
  }
});

export default ReopenView;
