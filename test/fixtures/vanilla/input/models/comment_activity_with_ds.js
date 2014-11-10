App.CommentActivityWithDS = DS.Model.extend({
  title: DS.attr('string'),
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});
