App.CommentActivitySerializer = DS.Serializer.extend({
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});
