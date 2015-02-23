import DuplicateName from '/my-app/views/duplicate-name';
import duplicateName from '/my-app/views/duplicate-name-x';
import SomeUnknownType from '/my-app/views/some-unknown-type';

var UseDuplicates = DuplicateName.extend({
  init: function() {
    duplicateName.hello();
  },
  hello: function() {
    console.log('hi');
  },
  helloAgain: SomeUnknownType.create()
});

export default UseDuplicates;
