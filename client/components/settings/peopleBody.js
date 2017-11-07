Meteor.subscribe('people');

BlazeComponent.extendComponent({
  onCreated() {
    this.error = new ReactiveVar('');
    this.loading = new ReactiveVar(false);
    this.people = new ReactiveVar(true);
  },
  setError(error) {
    this.error.set(error);
  },
  setLoading(w) {
    this.loading.set(w);
  },
  peopleList() {
    return Users.find({}, {
      fields: {_id: true},
    });
  },
}).register('people');

Template.peopleRow.helpers({
  userData() {
    const userCollection = this.esSearch ? ESSearchResults : Users;
    return userCollection.findOne(this.userId);
  },
});

Template.editUserPopup.helpers({
  user() {
    return Users.findOne(this.userId);
  },
});

BlazeComponent.extendComponent({
  onCreated() {
  },
  user() {
    return Users.findOne(this.userId);
  },
  events() {
    return [{
      'click a.edit-user': Popup.open('editUser'),
    }];
  },
}).register('peopleRow');

Template.editUserPopup.events({
  submit(evt, tpl) {
    evt.preventDefault();
    const user = Users.findOne(this.userId);
    const fullname = tpl.find('.js-profile-fullname').value.trim();
    const username = tpl.find('.js-profile-username').value.trim();
    const initials = tpl.find('.js-profile-initials').value.trim();
    const isAdmin = tpl.find('.js-profile-isadmin').value.trim();
    const email = tpl.find('.js-profile-email').value.trim();
    console.log('isAdmin', isAdmin);
    let isChangeUserName = false;
    let isChangeEmail = false;
    Users.update(this.userId, {
      $set: {
        'profile.fullname': fullname,
        'profile.initials': initials,
        'isAdmin': true,
      },
    });

    isChangeUserName = username !== user.username;
    isChangeEmail = email.toLowerCase() !== user.emails[0].address.toLowerCase();
    if (isChangeUserName && isChangeEmail) {
      Meteor.call('setUsernameAndEmail', username, email.toLowerCase(), function (error) {
        const usernameMessageElement = tpl.$('.username-taken');
        const emailMessageElement = tpl.$('.email-taken');
        if (error) {
          const errorElement = error.error;
          if (errorElement === 'username-already-taken') {
            usernameMessageElement.show();
            emailMessageElement.hide();
          } else if (errorElement === 'email-already-taken') {
            usernameMessageElement.hide();
            emailMessageElement.show();
          }
        } else {
          usernameMessageElement.hide();
          emailMessageElement.hide();
          Popup.back();
        }
      });
    } else if (isChangeUserName) {
      Meteor.call('setUsername', username, function (error) {
        const messageElement = tpl.$('.username-taken');
        if (error) {
          messageElement.show();
        } else {
          messageElement.hide();
          Popup.back();
        }
      });
    } else if (isChangeEmail) {
      Meteor.call('setEmail', email.toLowerCase(), function (error) {
        const messageElement = tpl.$('.email-taken');
        if (error) {
          messageElement.show();
        } else {
          messageElement.hide();
          Popup.back();
        }
      });
    } else Popup.back();
  },
});
