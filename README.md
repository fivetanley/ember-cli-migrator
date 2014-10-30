ember-cli-migrator
==================

migrate your files to the standard ember-cli structure, preserving git history

Still a weekend, WIP project. The goal of the project is to convert global variables to ES6 Modules. For example:

```javascript
App.Post = DS.Model.extend({

});
```

becomes

```javascript
import DS from "ember-data";

var Post = DS.Model.extend({

});

export default Post;
```

The project also aims to convert the file names for you and put them in the right folders. Some stretch goals include finding multiple controller definitions per file (I've noticed people tend to stick Ember Data adapter/serializer related code in the same file).

The project uses [recast](https://github.com/benjamn/recast) (which uses Esprima) to walk the JavaScript AST to accurately identify exports and move the file.
