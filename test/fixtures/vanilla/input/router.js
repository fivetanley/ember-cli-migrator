App.Router = Ember.Router.extend({
  someProperty: function() {
    console.log('hello');
  }
});

Router.map(function() {
  this.resource('myresource', {path:'/myresource/:resource_id'}, function(){
    this.route('details');
  });
});
