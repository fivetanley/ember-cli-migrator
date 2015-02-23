App.Router = Ember.Router.extend({
  someProperty: function() {
    console.log('hello');
  }
});

App.Router.reopen({
  location: 'auto'
});

App.Router.map(function() {
  this.resource('myresource', {path:'/myresource/:resource_id'}, function(){
    this.route('details');
  });
});
