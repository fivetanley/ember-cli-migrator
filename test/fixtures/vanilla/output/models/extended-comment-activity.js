import CommentActivity from '/my-app/models/comment-activity';

var ExtendedCommentActivity = CommentActivity.extend({
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});

export default ExtendedCommentActivity;
