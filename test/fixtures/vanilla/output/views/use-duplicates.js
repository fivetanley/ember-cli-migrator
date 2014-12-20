import DuplicateName from '/my-app/views/duplicate-name';
import duplicateName from '/my-app/views/duplicate-name-x';

var UseDuplicates = DuplicateName.extend({
  init: function() {
    duplicateName.hello();
  },
  hello: function() {
    console.log('hi');
  }
});

export default UseDuplicates;
