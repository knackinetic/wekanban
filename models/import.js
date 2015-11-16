const DateString = Match.Where(function (dateAsString) {
  check(dateAsString, String);
  return moment(dateAsString, moment.ISO_8601).isValid();
});

class TrelloCreator {
  constructor(data) {
    // The object creation dates, indexed by Trello id (so we only parse actions
    // once!)
    this.createdAt = {
      board: null,
      cards: {},
      lists: {},
    };
    // Map of labels Trello ID => Wekan ID
    this.labels = {};
    // Map of lists Trello ID => Wekan ID
    this.lists = {};
    // The comments, indexed by Trello card id (to map when importing cards)
    this.comments = {};
    // the members, indexed by Trello member id => Wekan user ID
    this.members = data.membersMapping ? data.membersMapping : {};

    // maps a trelloCardId to an array of trelloAttachments
    this.attachments = {};
  }

  checkActions(trelloActions) {
    check(trelloActions, [Match.ObjectIncluding({
      data: Object,
      date: DateString,
      type: String,
    })]);
    // XXX we could perform more thorough checks based on action type
  }

  checkBoard(trelloBoard) {
    check(trelloBoard, Match.ObjectIncluding({
      closed: Boolean,
      name: String,
      prefs: Match.ObjectIncluding({
        // XXX refine control by validating 'background' against a list of
        // allowed values (is it worth the maintenance?)
        background: String,
        permissionLevel: Match.Where((value) => {
          return ['org', 'private', 'public'].indexOf(value)>= 0;
        }),
      }),
    }));
  }

  checkCards(trelloCards) {
    check(trelloCards, [Match.ObjectIncluding({
      closed: Boolean,
      dateLastActivity: DateString,
      desc: String,
      idLabels: [String],
      idMembers: [String],
      name: String,
      pos: Number,
    })]);
  }

  checkLabels(trelloLabels) {
    check(trelloLabels, [Match.ObjectIncluding({
      // XXX refine control by validating 'color' against a list of allowed
      // values (is it worth the maintenance?)
      color: String,
      name: String,
    })]);
  }

  checkLists(trelloLists) {
    check(trelloLists, [Match.ObjectIncluding({
      closed: Boolean,
      name: String,
    })]);
  }

  // You must call parseActions before calling this one.
  createBoardAndLabels(trelloBoard) {
    const createdAt = this.createdAt.board;
    const boardToCreate = {
      archived: trelloBoard.closed,
      color: this.getColor(trelloBoard.prefs.background),
      createdAt,
      labels: [],
      members: [{
        userId: Meteor.userId(),
        isAdmin: true,
        isActive: true,
      }],
      permission: this.getPermission(trelloBoard.prefs.permissionLevel),
      slug: getSlug(trelloBoard.name) || 'board',
      stars: 0,
      title: trelloBoard.name,
    };
    // now add other members
    if(trelloBoard.memberships) {
      trelloBoard.memberships.forEach((trelloMembership) => {
        const trelloId = trelloMembership.idMember;
        // do we have a mapping?
        if(this.members[trelloId]) {
          const wekanId = this.members[trelloId];
          // do we already have it in our list?
          if(!boardToCreate.members.find((wekanMember) => {return (wekanMember.userId === wekanId);})) {
            boardToCreate.members.push({
              userId: wekanId,
              isAdmin: false,
              isActive: true,
            });
          }
        }
      });
    }
    trelloBoard.labels.forEach((label) => {
      const labelToCreate = {
        _id: Random.id(6),
        color: label.color,
        name: label.name,
      };
      // We need to remember them by Trello ID, as this is the only ref we have
      // when importing cards.
      this.labels[label.id] = labelToCreate._id;
      boardToCreate.labels.push(labelToCreate);
    });
    const now = new Date();
    const boardId = Boards.direct.insert(boardToCreate);
    Boards.direct.update(boardId, {$set: {modifiedAt: now}});
    // log activity
    Activities.direct.insert({
      activityType: 'importBoard',
      boardId,
      createdAt: now,
      source: {
        id: trelloBoard.id,
        system: 'Trello',
        url: trelloBoard.url,
      },
      // We attribute the import to current user, not the one from the original
      // object.
      userId: Meteor.userId(),
    });
    return boardId;
  }

  /**
   * Create the Wekan cards corresponding to the supplied Trello cards,
   * as well as all linked data: activities, comments, and attachments
   * @param trelloCards
   * @param boardId
   * @returns {Array}
   */
  createCards(trelloCards, boardId) {
    const result = [];
    trelloCards.forEach((card) => {
      const cardToCreate = {
        archived: card.closed,
        boardId,
        createdAt: new Date(this.createdAt.cards[card.id]  || Date.now()),
        dateLastActivity: new Date(),
        description: card.desc,
        listId: this.lists[card.idList],
        sort: card.pos,
        title: card.name,
        // XXX use the original user?
        userId: Meteor.userId(),
      };
      // add labels
      if (card.idLabels) {
        cardToCreate.labelIds = card.idLabels.map((trelloId) => {
          return this.labels[trelloId];
        });
      }
      // add members {
      if(card.idMembers) {
        const wekanMembers = [];
        // we can't just map, as some members may not have been mapped
        card.idMembers.forEach((trelloId) => {
          if(this.members[trelloId]) {
            const wekanId = this.members[trelloId];
            // we may map multiple Trello members to the same wekan user
            // in which case we risk adding the same user multiple times
            if(!wekanMembers.find((wId) => {return (wId === wekanId);})){
              wekanMembers.push(wekanId);
            }
          }
          return true;
        });
        if(wekanMembers.length>0) {
          cardToCreate.members = wekanMembers;
        }
      }
      // insert card
      const cardId = Cards.direct.insert(cardToCreate);
      // log activity
      Activities.direct.insert({
        activityType: 'importCard',
        boardId,
        cardId,
        createdAt: new Date(),
        listId: cardToCreate.listId,
        source: {
          id: card.id,
          system: 'Trello',
          url: card.url,
        },
        // we attribute the import to current user, not the one from the
        // original card
        userId: Meteor.userId(),
      });
      // add comments
      const comments = this.comments[card.id];
      if (comments) {
        comments.forEach((comment) => {
          const commentToCreate = {
            boardId,
            cardId,
            createdAt: comment.date,
            text: comment.data.text,
            // XXX use the original comment user instead
            userId: Meteor.userId(),
          };
          // dateLastActivity will be set from activity insert, no need to
          // update it ourselves
          const commentId = CardComments.direct.insert(commentToCreate);
          Activities.direct.insert({
            activityType: 'addComment',
            boardId: commentToCreate.boardId,
            cardId: commentToCreate.cardId,
            commentId,
            createdAt: commentToCreate.createdAt,
            userId: commentToCreate.userId,
          });
        });
      }
      const attachments = this.attachments[card.id];
      const trelloCoverId = card.idAttachmentCover;
      if (attachments) {
        attachments.forEach((att) => {
          const file = new FS.File();
          // Simulating file.attachData on the client generates multiple errors
          // - HEAD returns null, which causes exception down the line
          // - the template then tries to display the url to the attachment which causes other errors
          // so we make it server only, and let UI catch up once it is done, forget about latency comp.
          if(Meteor.isServer) {
            file.attachData(att.url, function (error) {
              file.boardId = boardId;
              file.cardId = cardId;
              if (error) {
                throw(error);
              } else {
                const wekanAtt = Attachments.insert(file, () => {
                  // we do nothing
                });
                //
                if(trelloCoverId === att.id) {
                  Cards.direct.update(cardId, { $set: {coverId: wekanAtt._id}});
                }
              }
            });
          }
          // todo XXX set cover - if need be
        });
      }
      result.push(cardId);
    });
    return result;
  }

  // Create labels if they do not exist and load this.labels.
  createLabels(trelloLabels, board) {
    trelloLabels.forEach((label) => {
      const color = label.color;
      const name = label.name;
      const existingLabel = board.getLabel(name, color);
      if (existingLabel) {
        this.labels[label.id] = existingLabel._id;
      } else {
        const idLabelCreated = board.pushLabel(name, color);
        this.labels[label.id] = idLabelCreated;
      }
    });
  }

  createLists(trelloLists, boardId) {
    trelloLists.forEach((list) => {
      const listToCreate = {
        archived: list.closed,
        boardId,
        // We are being defensing here by providing a default date (now) if the
        // creation date wasn't found on the action log. This happen on old
        // Trello boards (eg from 2013) that didn't log the 'createList' action
        // we require.
        createdAt: new Date(this.createdAt.lists[list.id] || Date.now()),
        title: list.name,
        userId: Meteor.userId(),
      };
      const listId = Lists.direct.insert(listToCreate);
      const now = new Date();
      Lists.direct.update(listId, {$set: {'updatedAt': now}});
      this.lists[list.id] = listId;
      // log activity
      Activities.direct.insert({
        activityType: 'importList',
        boardId,
        createdAt: now,
        listId,
        source: {
          id: list.id,
          system: 'Trello',
        },
        // We attribute the import to current user, not the one from the
        // original object
        userId: Meteor.userId(),
      });
    });
  }


  getColor(trelloColorCode) {
    // trello color name => wekan color
    const mapColors = {
      'blue': 'belize',
      'orange': 'pumpkin',
      'green': 'nephritis',
      'red': 'pomegranate',
      'purple': 'wisteria',
      'pink': 'pomegranate',
      'lime': 'nephritis',
      'sky': 'belize',
      'grey': 'midnight',
    };
    const wekanColor = mapColors[trelloColorCode];
    return wekanColor || Boards.simpleSchema()._schema.color.allowedValues[0];
  }

  getPermission(trelloPermissionCode) {
    if (trelloPermissionCode === 'public') {
      return 'public';
    }
    // Wekan does NOT have organization level, so we default both 'private' and
    // 'org' to private.
    return 'private';
  }

  parseActions(trelloActions) {
    trelloActions.forEach((action) => {
      switch (action.type) {
      case 'addAttachmentToCard':
        // We have to be cautious, because the attachment could have been removed later.
        // In that case Trello still reports its addition, but removes its 'url' field.
        // So we test for that
        const trelloAttachment = action.data.attachment;
        if(trelloAttachment.url) {
          // we cannot actually create the Wekan attachment, because we don't yet
          // have the cards to attach it to, so we store it in the instance variable.
          const trelloCardId = action.data.card.id;
          if(!this.attachments[trelloCardId]) {
            this.attachments[trelloCardId] = [];
          }
          this.attachments[trelloCardId].push(trelloAttachment);
        }
        break;
      case 'commentCard':
        const id = action.data.card.id;
        if (this.comments[id]) {
          this.comments[id].push(action);
        } else {
          this.comments[id] = [action];
        }
        break;
      case 'createBoard':
        this.createdAt.board = action.date;
        break;
      case 'createCard':
        const cardId = action.data.card.id;
        this.createdAt.cards[cardId] = action.date;
        break;
      case 'createList':
        const listId = action.data.list.id;
        this.createdAt.lists[listId] = action.date;
        break;
      default:
        // do nothing
        break;
      }
    });
  }
}

Meteor.methods({
  importTrelloBoard(trelloBoard, data) {
    const trelloCreator = new TrelloCreator(data);

    // 1. check all parameters are ok from a syntax point of view
    try {
      check(data, {
        membersMapping: Match.Optional(Object),
      });
      trelloCreator.checkActions(trelloBoard.actions);
      trelloCreator.checkBoard(trelloBoard);
      trelloCreator.checkLabels(trelloBoard.labels);
      trelloCreator.checkLists(trelloBoard.lists);
      trelloCreator.checkCards(trelloBoard.cards);
    } catch (e) {
      throw new Meteor.Error('error-json-schema');
    }

    // 2. check parameters are ok from a business point of view (exist &
    // authorized) nothing to check, everyone can import boards in their account

    // 3. create all elements
    trelloCreator.parseActions(trelloBoard.actions);
    const boardId = trelloCreator.createBoardAndLabels(trelloBoard);
    trelloCreator.createLists(trelloBoard.lists, boardId);
    trelloCreator.createCards(trelloBoard.cards, boardId);
    // XXX add members
    return boardId;
  },

  importTrelloCard(trelloCard, data) {
    const trelloCreator = new TrelloCreator(data);

    // 1. check parameters are ok from a syntax point of view
    try {
      check(data, {
        listId: String,
        sortIndex: Number,
        membersMapping: Match.Optional(Object),
      });
      trelloCreator.checkCards([trelloCard]);
      trelloCreator.checkLabels(trelloCard.labels);
      trelloCreator.checkActions(trelloCard.actions);
    } catch(e) {
      throw new Meteor.Error('error-json-schema');
    }

    // 2. check parameters are ok from a business point of view (exist &
    // authorized)
    const list = Lists.findOne(data.listId);
    if (!list) {
      throw new Meteor.Error('error-list-doesNotExist');
    }
    if (Meteor.isServer) {
      if (!allowIsBoardMember(Meteor.userId(), Boards.findOne(list.boardId))) {
        throw new Meteor.Error('error-board-notAMember');
      }
    }

    // 3. create all elements
    trelloCreator.lists[trelloCard.idList] = data.listId;
    trelloCreator.parseActions(trelloCard.actions);
    const board = list.board();
    trelloCreator.createLabels(trelloCard.labels, board);
    const cardIds = trelloCreator.createCards([trelloCard], board._id);
    return cardIds[0];
  },
});
