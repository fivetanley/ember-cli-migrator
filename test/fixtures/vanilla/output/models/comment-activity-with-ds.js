import DS from 'ember-data';

var CommentActivityWithDS = DS.Model.extend({
  title: DS.attr('string'),
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});

export default CommentActivityWithDS;
