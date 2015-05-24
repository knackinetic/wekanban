BlazeComponent.extendComponent({
  template: function() {
    return 'list';
  },

  // Proxies
  openForm: function(options) {
    this.componentChildren('listBody')[0].openForm(options);
  },

  showNewCardForm: function(value) {
    this.componentChildren('listBody')[0].showNewCardForm(value);
  },

  onCreated: function() {
    this.newCardFormIsVisible = new ReactiveVar(true);
  },

  // XXX The jQuery UI sortable plugin is far from ideal here. First we include
  // all jQuery components but only use one. Second, it modifies the DOM itself,
  // resulting in Blaze abandoning reactive update of the nodes that have been
  // moved which result in bugs if multiple users use the board in real time. I
  // tried sortable:sortable but that was not better. And dragula is not
  // powerful enough for our use casesShould we “simply” write the drag&drop
  // code ourselves?
  onRendered: function() {
    if (Meteor.user().isBoardMember()) {
      var boardComponent = this.componentParent();
      var itemsSelector = '.js-minicard:not(.placeholder, .hide, .js-composer)';
      var $cards = this.$('.js-minicards');
      $cards.sortable({
        connectWith: '.js-minicards',
        tolerance: 'pointer',
        appendTo: '.js-lists',
        helper: 'clone',
        items: itemsSelector,
        placeholder: 'minicard placeholder',
        start: function(event, ui) {
          $('.minicard.placeholder').height(ui.item.height());
          Popup.close();
          boardComponent.showNewCardForms(false);
        },
        stop: function(event, ui) {
          // To attribute the new index number, we need to get the dom element
          // of the previous and the following card -- if any.
          var cardDomElement = ui.item.get(0);
          var prevCardDomElement = ui.item.prev('.js-minicard').get(0);
          var nextCardDomElement = ui.item.next('.js-minicard').get(0);
          var sort = Utils.getSortIndex(prevCardDomElement, nextCardDomElement);
          var cardId = Blaze.getData(cardDomElement)._id;
          var listId = Blaze.getData(ui.item.parents('.list').get(0))._id;
          Cards.update(cardId, {
            $set: {
              listId: listId,
              sort: sort
            }
          });
          boardComponent.showNewCardForms(true);
        }
      }).disableSelection();

      $(document).on('mouseover', function() {
        $cards.find(itemsSelector).droppable({
          hoverClass: 'draggable-hover-card',
          accept: '.js-member,.js-label',
          drop: function(event, ui) {
            var cardId = Blaze.getData(this)._id;

            if (ui.draggable.hasClass('js-member')) {
              var memberId = Blaze.getData(ui.draggable.get(0)).userId;
              Cards.update(cardId, {$addToSet: {members: memberId}});
            } else {
              var labelId = Blaze.getData(ui.draggable.get(0))._id;
              Cards.update(cardId, {$addToSet: {labelIds: labelId}});
            }
          }
        });
      });
    }
  }
}).register('list');
