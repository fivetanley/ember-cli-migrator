import DS from "ember-data";

var UserSerializer = DS.Serializer.extend({
  someProperty: function(){
    console.log('hello');
  }.property('hello')
});

export default UserSerializer;
