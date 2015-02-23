App.ObjectTransform = DS.Transform.extend({
  serialize: function(value) {
    return value;
  },
  deserialize: function(value) {
    if(Ember.isArray(value)){
      return value.map(function(v){
        return ("object" == typeof v) ? Ember.Object.create(v) : v;
      });
    }else if("object" == typeof value){
      return Ember.Object.create(value);
    }
    return value;
  }
});
