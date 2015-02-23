import DS from 'ember-data';

var ApplicationAdapter = DS.ActiveModelAdapter.extend({
  namespace: 'v2/api'
});

export default ApplicationAdapter;
