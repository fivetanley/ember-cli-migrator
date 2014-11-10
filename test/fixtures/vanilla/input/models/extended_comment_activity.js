App.ExtendedCommentActivity = App.CommentActivity.extend({
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});
