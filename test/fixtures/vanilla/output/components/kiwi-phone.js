import Ember from 'ember';

var KiwiPhoneComponent = Ember.Component.extend({
  classNames: 'form-group',

  inputElementId: function(){
    return 'input-' + this.get('elementId');
  }.property('elementId'),

  translatedLabel: function(){
    return translate(this.get('label'));
  }.property('label'),

  actions: {
    savePhoneNumber: function(phoneNumber){
      this.sendAction('action', phoneNumber);
    }
  }
});

export default KiwiPhoneComponent;
