App.DuplicateName = Ember.Object.extend({
  hello: function() {
    console.log('hello');
  }
});

App.duplicateName = App.DuplicateName.create();

App.SomeUnknownType = Ember.Object.extend({
  helloAgain: function() {
    console.log('hello');
  }
});
