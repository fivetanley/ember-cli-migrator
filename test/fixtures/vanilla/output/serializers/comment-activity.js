import DS from 'ember-data';

var CommentActivitySerializer = DS.Serializer.extend({
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});

export default CommentActivitySerializer;
