import UsefulMixin from '/my-app/mixins/useful';
import Ember from 'ember';


var WithMixinController = Ember.ObjectController.extend(UsefulMixin, {
  someControllerProperty: 'props'
});

export default WithMixinController;
