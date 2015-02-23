import Ember from 'ember';

var Router = Ember.Router.extend({
  someProperty: function() {
    console.log('hello');
  }
});
Router.reopen({
  location: 'auto'
});
Router.map(function() {
  this.resource('myresource', {path:'/myresource/:resource_id'}, function(){
    this.route('details');
  });
});

export default Router;
