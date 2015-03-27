import Ember from 'ember';

var SeattleAlertService = Ember.Object.extend({
  alerts: Ember.A(),

  success: function(context, opts) {
    opts.style = 'success';
    this.create(context, opts);
  },

  create: function(context, opts) {
    var defaults = {
      hideClose: false,
      style: 'default',
    };

    Ember.merge(defaults, opts);

    var alert = Ember.ObjectProxy.extend({
      content: context,
      options: defaults,
    }).create();

    this.get('alerts').pushObject(alert);
  }
});

export default SeattleAlertService;
