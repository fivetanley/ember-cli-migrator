import Ember from 'ember';

function reprint(thing) {
  return thing;
}

export default Ember.Handlebars.makeBoundHelper(reprint);
