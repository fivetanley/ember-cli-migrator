App.UseDuplicates = App.DuplicateName.extend({
  init: function() {
    App.duplicateName.hello();
  },
  hello: function() {
    console.log('hi');
  },
  helloAgain: App.SomeUnknownType.create()
});
