App.ReopenView = Ember.View.extend({
  hello: function () {
    console.log('hello');
  }
});

App.ReopenView.reopen({
  helloAgain: function () {
    console.log('hi');
  }
});
