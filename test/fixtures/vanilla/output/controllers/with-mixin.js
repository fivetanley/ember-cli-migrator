import Ember from 'ember';
import UsefulMixin from 'my-app/mixins/useful';

var WithMixinController = Ember.ObjectController.extend(UsefulMixin, {
  someControllerProperty: 'props'
});

export default WithMixinController;
