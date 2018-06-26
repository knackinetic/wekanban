Subtasks = new Mongo.Collection('subtasks');

Subtasks.attachSchema(new SimpleSchema({
  title: {
    type: String,
  },
  startAt: { // this is a predicted time
    type: Date,
    optional: true,
  },
  endAt: { // this is a predicted time
    type: Date,
    optional: true,
  },
  finishedAt: { // The date & time when it is marked as being done
    type: Date,
    optional: true,
  },
  createdAt: {
    type: Date,
    denyUpdate: false,
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
  },
  isFinished: {
    type: Boolean,
    defaultValue: false,
  },
  cardId: {
    type: String,
  },
}));

Subtasks.helpers({
  isFinished() {
    return 0 !== this.itemCount() && this.itemCount() === this.finishedCount();
  },
  itemIndex(itemId) {
    const items = self.findOne({_id : this._id}).items;
    return _.pluck(items, '_id').indexOf(itemId);
  },
});

Subtasks.allow({
  insert(userId, doc) {
    return allowIsBoardMemberByCard(userId, Cards.findOne(doc.cardId));
  },
  update(userId, doc) {
    return allowIsBoardMemberByCard(userId, Cards.findOne(doc.cardId));
  },
  remove(userId, doc) {
    return allowIsBoardMemberByCard(userId, Cards.findOne(doc.cardId));
  },
  fetch: ['userId', 'cardId'],
});

Subtasks.before.insert((userId, doc) => {
  doc.createdAt = new Date();
  if (!doc.userId) {
    doc.userId = userId;
  }
});

// Mutations
Subtasks.mutations({
  setTitle(title) {
    return { $set: { title } };
  },
  toggleItem() {
    return { $set: { isFinished: !this.isFinished } };
  },
  move(sortIndex) {
    const mutatedFields = {
      sort: sortIndex,
    };

    return {$set: mutatedFields};
  },
});

// Activities helper
function itemCreation(userId, doc) {
  const card = Cards.findOne(doc.cardId);
  const boardId = card.boardId;
  Activities.insert({
    userId,
    activityType: 'addSubtaskItem',
    cardId: doc.cardId,
    boardId,
    subtaskItemId: doc._id,
  });
}

function itemRemover(userId, doc) {
  Activities.remove({
    subtaskItemId: doc._id,
  });
}

// Activities
if (Meteor.isServer) {
  Meteor.startup(() => {
    Subtasks._collection._ensureIndex({ cardId: 1 });
  });

  Subtasks.after.insert((userId, doc) => {
    itemCreation(userId, doc);
  });

  Subtasks.after.remove((userId, doc) => {
    itemRemover(userId, doc);
  });
}

// APIs
if (Meteor.isServer) {
  JsonRoutes.add('GET', '/api/boards/:boardId/cards/:cardId/subtasks/:itemId', function (req, res) {
    Authentication.checkUserId( req.userId);
    const paramItemId = req.params.itemId;
    const subtaskItem = Subtasks.findOne({ _id: paramItemId });
    if (subtaskItem) {
      JsonRoutes.sendResult(res, {
        code: 200,
        data: subtaskItem,
      });
    } else {
      JsonRoutes.sendResult(res, {
        code: 500,
      });
    }
  });

  JsonRoutes.add('PUT', '/api/boards/:boardId/cards/:cardId/subtasks/:itemId', function (req, res) {
    Authentication.checkUserId( req.userId);

    const paramItemId = req.params.itemId;

    if (req.body.hasOwnProperty('isFinished')) {
      Subtasks.direct.update({_id: paramItemId}, {$set: {isFinished: req.body.isFinished}});
    }
    if (req.body.hasOwnProperty('title')) {
      Subtasks.direct.update({_id: paramItemId}, {$set: {title: req.body.title}});
    }

    JsonRoutes.sendResult(res, {
      code: 200,
      data: {
        _id: paramItemId,
      },
    });
  });

  JsonRoutes.add('DELETE', '/api/boards/:boardId/cards/:cardId/subtasks/:itemId', function (req, res) {
    Authentication.checkUserId( req.userId);
    const paramItemId = req.params.itemId;
    Subtasks.direct.remove({ _id: paramItemId });
    JsonRoutes.sendResult(res, {
      code: 200,
      data: {
        _id: paramItemId,
      },
    });
  });
}
