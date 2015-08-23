var subManager = new SubsManager();

BlazeComponent.extendComponent({
  template: function() {
    return 'board';
  },

  onCreated: function() {
    var self = this;
    self.draggingActive = new ReactiveVar(false);
    self.showOverlay = new ReactiveVar(false);
    self.isBoardReady = new ReactiveVar(false);

    // The pattern we use to manually handle data loading is described here:
    // https://kadira.io/academy/meteor-routing-guide/content/subscriptions-and-data-management/using-subs-manager
    // XXX The boardId should be readed from some sort the component "props",
    // unfortunatly, Blaze doesn't have this notion.
    self.autorun(function() {
      var handle = subManager.subscribe('board', Session.get('currentBoard'));
      self.isBoardReady.set(handle.ready());
    });
  },

  openNewListForm: function() {
    this.componentChildren('addListForm')[0].open();
  },

  // XXX Flow components allow us to avoid creating these two setter methods by
  // exposing a public API to modify the component state. We need to investigate
  // best practices here.
  setIsDragging: function(bool) {
    this.draggingActive.set(bool);
  },

  scrollLeft: function(position) {
    position = position || 0;
    var $container = $(this.find('.js-lists'));
    var containerWidth = $container.width();
    var currentScrollPosition = $container.scrollLeft();
    if (position < currentScrollPosition) {
      $container.animate({
        scrollLeft: position
      });
    } else if (position > currentScrollPosition + containerWidth) {
      $container.animate({
        scrollLeft: Math.max(0, position - containerWidth)
      });
    }
  },

  currentCardIsInThisList: function() {
    var currentCard = Cards.findOne(Session.get('currentCard'));
    var listId = this.currentData()._id;
    return currentCard && currentCard.listId === listId;
  },

  sidebarSize: function() {
    var sidebar = this.componentChildren('sidebar')[0];
    if (sidebar && sidebar.isOpen())
      return 'next-sidebar';
  },

  events: function() {
    return [{
      // XXX The board-overlay div should probably be moved to the parent
      // component.
      'mouseenter .board-overlay': function() {
        this.showOverlay.set(false);
      }
    }];
  }
}).register('board');

Template.boardBody.onRendered(function() {
  var self = BlazeComponent.getComponentForElement(this.firstNode);

  self.scrollLeft();

  var lists = this.find('.js-lists');

  // We want to animate the card details window closing. We rely on CSS
  // transition for the actual animation.
  lists._uihooks = {
    removeElement: function(node) {
      var removeNode = _.once(function() {
        node.parentNode.removeChild(node);
      });
      if ($(node).hasClass('js-card-details')) {
        $(node).css({
          flexBasis: 0,
          padding: 0
        });
        $(lists).one(CSSEvents.transitionend, removeNode);
      } else {
        removeNode();
      }
    }
  };

  if (! Meteor.user() || ! Meteor.user().isBoardMember())
    return;

  self.$(lists).sortable({
    tolerance: 'pointer',
    helper: 'clone',
    items: '.js-list:not(.js-list-composer)',
    placeholder: 'list placeholder',
    distance: 7,
    start: function(evt, ui) {
      ui.placeholder.height(ui.helper.height());
      Popup.close();
    },
    stop: function() {
      self.$('.js-lists').find('.js-list:not(.js-list-composer)').each(
        function(i, list) {
          var data = Blaze.getData(list);
          Lists.update(data._id, {
            $set: {
              sort: i
            }
          });
        }
      );
    }
  });

  // Disable drag-dropping while in multi-selection mode
  self.autorun(function() {
    self.$(lists).sortable('option', 'disabled', MultiSelection.isActive());
  });

  // If there is no data in the board (ie, no lists) we autofocus the list
  // creation form by clicking on the corresponding element.
  var currentBoard = Boards.findOne(Session.get('currentBoard'));
  if (currentBoard.lists().count() === 0) {
    self.openNewListForm();
  }
});

BlazeComponent.extendComponent({
  template: function() {
    return 'addListForm';
  },

  // Proxy
  open: function() {
    this.componentChildren('inlinedForm')[0].open();
  },

  events: function() {
    return [{
      submit: function(evt) {
        evt.preventDefault();
        var title = this.find('.list-name-input');
        if ($.trim(title.value)) {
          Lists.insert({
            title: title.value,
            boardId: Session.get('currentBoard'),
            sort: $('.list').length
          });

          title.value = '';
        }
      }
    }];
  }
}).register('addListForm');
