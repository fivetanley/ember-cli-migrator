var UsefulMixin = require("../mixins/useful_mixin");

var WithMixinController = Ember.ObjectController.extend(UsefulMixin, {
  someControllerProperty: 'props'
});

module.exports = WithMixinController;
