BlazeComponent.extendComponent({
  editTitle(evt) {
    evt.preventDefault();
    const newTitle = this.childComponents('inlinedForm')[0].getValue().trim();
    const list = this.currentData();
    if (newTitle) {
      list.rename(newTitle.trim());
    }
  },

  isWatching() {
    const list = this.currentData();
    return list.findWatcher(Meteor.userId());
  },

  limitToShowCardsCount() {
    return Meteor.user().getLimitToShowCardsCount();
  },

  showCardsCountForList(count) {
    return count > this.limitToShowCardsCount();
  },

  hasWipLimit() {
    return null;
      //return this.currentData().wipLimit ? true : false;
  },

  events() {
    return [{
      'click .js-open-list-menu': Popup.open('listAction'),
      'click .js-add-card' () {
        const listDom = document.getElementById(`js-list-${this.currentData()._id}`);
        const listComponent = BlazeComponent.getComponentForElement(listDom);
        listComponent.openForm({
          position: 'top',
        });
      },
      submit: this.editTitle,
    }];
  },
}).register('listHeader');

Template.listActionPopup.helpers({
  isWatching() {
    return this.findWatcher(Meteor.userId());
  },
});

Template.listActionPopup.events({
  'click .js-list-subscribe' () {},
  'click .js-select-cards' () {
    const cardIds = this.allCards().map((card) => card._id);
    MultiSelection.add(cardIds);
    Popup.close();
  },
  'click .js-toggle-watch-list' () {
    const currentList = this;
    const level = currentList.findWatcher(Meteor.userId()) ? null : 'watching';
    Meteor.call('watch', 'list', currentList._id, level, (err, ret) => {
      if (!err && ret) Popup.close();
    });
  },
  'click .js-close-list' (evt) {
    evt.preventDefault();
    this.archive();
    Popup.close();
  },
  'click .js-set-wip-limit': Popup.open('setWipLimit'),
  'click .js-more': Popup.open('listMore'),
});

Template.listMorePopup.events({
  'click .js-delete': Popup.afterConfirm('listDelete', function () {
    Popup.close();
    this.allCards().map((card) => Cards.remove(card._id));
    Lists.remove(this._id);
    Utils.goBoardId(this.boardId);
  }),
});
