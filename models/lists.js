Lists = new Mongo.Collection('lists');

Lists.attachSchema(new SimpleSchema({
  title: {
    type: String,
  },
  archived: {
    type: Boolean,
    autoValue() { // eslint-disable-line consistent-return
      if (this.isInsert && !this.isSet) {
        return false;
      }
    },
  },
  boardId: {
    type: String,
  },
  createdAt: {
    type: Date,
    autoValue() { // eslint-disable-line consistent-return
      if (this.isInsert) {
        return new Date();
      } else {
        this.unset();
      }
    },
  },
  sort: {
    type: Number,
    decimal: true,
    // XXX We should probably provide a default
    optional: true,
  },
  updatedAt: {
    type: Date,
    optional: true,
    autoValue() { // eslint-disable-line consistent-return
      if (this.isUpdate) {
        return new Date();
      } else {
        this.unset();
      }
    },
  },
  wipLimit: {
    type: Object,
    optional: true,
  },
  'wipLimit.value': {
    type: Number,
    decimal: false,
    autoValue() {
      if(this.isInsert){
        return 0;
      }
      return this.value;
    },
    optional: true,
  },
  'wipLimit.enabled':{
    type: Boolean,
    autoValue() {
      if(this.isInsert){
        return false;
      }
      return this.value;
    },
    optional: true,
  },
}));

Lists.allow({
  insert(userId, doc) {
    return allowIsBoardMemberNonComment(userId, Boards.findOne(doc.boardId));
  },
  update(userId, doc) {
    return allowIsBoardMemberNonComment(userId, Boards.findOne(doc.boardId));
  },
  remove(userId, doc) {
    return allowIsBoardMemberNonComment(userId, Boards.findOne(doc.boardId));
  },
  fetch: ['boardId'],
});

Lists.helpers({
  cards() {
    return Cards.find(Filter.mongoSelector({
      listId: this._id,
      archived: false,
    }), { sort: ['sort'] });
  },

  allCards() {
    return Cards.find({ listId: this._id });
  },

  board() {
    return Boards.findOne(this.boardId);
  },

  getWipLimit(option){
    const list = Lists.findOne({ _id: this._id });
    if(!list.wipLimit) { // Necessary check to avoid exceptions for the case where the doc doesn't have the wipLimit field yet set
      return 0;
    } else if(!option) {
      return list.wipLimit;
    } else {
      return list.wipLimit[option] ? list.wipLimit[option] : 0; // Necessary check to avoid exceptions for the case where the doc doesn't have the wipLimit field yet set
    }
  },
});

Lists.mutations({
  rename(title) {
    return { $set: { title } };
  },

  archive() {
    return { $set: { archived: true } };
  },

  restore() {
    return { $set: { archived: false } };
  },

  toggleWipLimit(toggle) {
    return { $set: { 'wipLimit.enabled': toggle } };
  },

  setWipLimit(limit) {
    return { $set: { 'wipLimit.value': limit } };
  },
});

Meteor.methods({
  applyWipLimit(listId, limit){
    check(listId, String);
    check(limit, Number);
    Lists.findOne({ _id: listId }).setWipLimit(limit);
  },

  enableWipLimit(listId) {
    check(listId, String);
    const list = Lists.findOne({ _id: listId });
    if(list.getWipLimit()){ // Necessary check to avoid exceptions for the case where the doc doesn't have the wipLimit field yet set
      list.toggleWipLimit(!list.getWipLimit('enabled'));
    } else {
      list.toggleWipLimit(true); // First time toggle is always to 'true' because default is 'false'
    }
  },
});

Lists.hookOptions.after.update = { fetchPrevious: false };

if (Meteor.isServer) {
  Meteor.startup(() => {
    Lists._collection._ensureIndex({ boardId: 1 });
  });

  Lists.after.insert((userId, doc) => {
    Activities.insert({
      userId,
      type: 'list',
      activityType: 'createList',
      boardId: doc.boardId,
      listId: doc._id,
    });
  });

  Lists.before.remove((userId, doc) => {
    Activities.insert({
      userId,
      type: 'list',
      activityType: 'removeList',
      boardId: doc.boardId,
      listId: doc._id,
      title: doc.title,
    });
  });

  Lists.after.update((userId, doc) => {
    if (doc.archived) {
      Activities.insert({
        userId,
        type: 'list',
        activityType: 'archivedList',
        listId: doc._id,
        boardId: doc.boardId,
      });
    }
  });
}

//LISTS REST API
if (Meteor.isServer) {
  JsonRoutes.add('GET', '/api/boards/:boardId/lists', function (req, res, next) {
    const paramBoardId = req.params.boardId;
    Authentication.checkBoardAccess( req.userId, paramBoardId);

    JsonRoutes.sendResult(res, {
      code: 200,
      data: Lists.find({ boardId: paramBoardId, archived: false }).map(function (doc) {
        return {
          _id: doc._id,
          title: doc.title,
        };
      }),
    });
  });

  JsonRoutes.add('GET', '/api/boards/:boardId/lists/:listId', function (req, res, next) {
    const paramBoardId = req.params.boardId;
    const paramListId = req.params.listId;
    Authentication.checkBoardAccess( req.userId, paramBoardId);
    JsonRoutes.sendResult(res, {
      code: 200,
      data: Lists.findOne({ _id: paramListId, boardId: paramBoardId, archived: false }),
    });
  });

  JsonRoutes.add('POST', '/api/boards/:boardId/lists', function (req, res, next) {
    Authentication.checkUserId( req.userId);
    const paramBoardId = req.params.boardId;
    const id = Lists.insert({
      title: req.body.title,
      boardId: paramBoardId,
    });
    JsonRoutes.sendResult(res, {
      code: 200,
      data: {
        _id: id,
      },
    });
  });

  JsonRoutes.add('DELETE', '/api/boards/:boardId/lists/:listId', function (req, res, next) {
    Authentication.checkUserId( req.userId);
    const paramBoardId = req.params.boardId;
    const paramListId = req.params.listId;
    Lists.remove({ _id: paramListId, boardId: paramBoardId });
    JsonRoutes.sendResult(res, {
      code: 200,
      data: {
        _id: paramListId,
      },
    });
  });

}
