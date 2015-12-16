/* global JsonRoutes */
if(Meteor.isServer) {
  JsonRoutes.add('get', '/api/b/:boardId/:userId/:loginToken', function (req, res) {
    const { userId, loginToken, boardId } = req.params;
    const hashToken = Accounts._hashLoginToken(loginToken);
    const user = Meteor.users.findOne({
      _id: userId,
      'services.resume.loginTokens.hashedToken': hashToken,
    });

    const exporter = new Exporter(boardId);
    if(user && exporter.canExport(user)) {
      JsonRoutes.sendResult(res, 200, exporter.build());
    } else {
      // we could send an explicit error message, but on the other
      // hand the only way to get there is by hacking the UI so...
      JsonRoutes.sendResult(res, 403);
    }
  });
}


Meteor.methods({
  exportBoard(boardId) {
    check(boardId, String);
    const exporter = new Exporter(boardId);
    if(exporter.canExport(Meteor.user())) {
      return exporter.build();
    } else {
      throw new Meteor.Error('error-board-notAMember');
    }
  },
});

class Exporter {
  constructor(boardId) {
    this._boardId = boardId;
  }

  build() {
    const byBoard = {boardId: this._boardId};
    // we do not want to retrieve boardId in related elements
    const noBoardId = {fields: {boardId: 0}};
    const result = Boards.findOne(this._boardId, {fields: {stars: 0}});
    result.lists = Lists.find(byBoard, noBoardId).fetch();
    result.cards = Cards.find(byBoard, noBoardId).fetch();
    result.comments = CardComments.find(byBoard, noBoardId).fetch();
    result.activities = Activities.find(byBoard, noBoardId).fetch();

    // we also have to export some user data - as the other elements only include id
    // but we have to be careful:
    // 1- only exports users that are linked somehow to that board
    // 2- do not export any sensitive information
    const users = {};
    result.members.forEach((member) => {users[member.userId] = true;});
    result.lists.forEach((list) => {users[list.userId] = true;});
    result.cards.forEach((card) => {
      users[card.userId] = true;
      if (card.members) {
        card.members.forEach((memberId) => {users[memberId] = true;});
      }
    });
    result.comments.forEach((comment) => {users[comment.userId] = true;});
    result.activities.forEach((activity) => {users[activity.userId] = true;});
    const byUserIds = {_id: {$in: Object.getOwnPropertyNames(users)}};
    // we use whitelist to be sure we do not expose inadvertently
    // some secret fields that gets added to User later.
    const userFields = {fields: {
      _id: 1,
      username: 1,
      'profile.fullname': 1,
      'profile.initials': 1,
      'profile.avatarUrl': 1,
    }};
    result.users = Users.find(byUserIds, userFields).fetch();
    return result;
  }

  canExport(user) {
    const board = Boards.findOne(this._boardId);
    return board && board.isVisibleBy(user);
  }
}
