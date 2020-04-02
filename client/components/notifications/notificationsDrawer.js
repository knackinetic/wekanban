import { toggleNotificationsDrawer } from './notifications.js';

Template.notificationsDrawer.onCreated(function() {
  Meteor.subscribe('notificationActivities');
  Meteor.subscribe('notificationCards');
  Meteor.subscribe('notificationUsers');
  Meteor.subscribe('notificationsAttachments');
  Meteor.subscribe('notificationChecklistItems');
  Meteor.subscribe('notificationChecklists');
  Meteor.subscribe('notificationComments');
  Meteor.subscribe('notificationLists');
  Meteor.subscribe('notificationSwimlanes');
});

Template.notificationsDrawer.helpers({
  transformedProfile() {
    return Users.findOne(Meteor.userId());
  },
});

Template.notificationsDrawer.events({
  'click .all-read'() {
    const notifications = Meteor.user().profile.notifications;
    for (const index in notifications) {
      if (notifications.hasOwnProperty(index) && !notifications[index].read) {
        const update = {};
        update[`profile.notifications.${index}.read`] = Date.now();
        Users.update(Meteor.userId(), { $set: update });
      }
    }
  },
  'click .close'() {
    toggleNotificationsDrawer();
  },
  'click .toggle-read'() {
    Session.set('showReadNotifications', !Session.get('showReadNotifications'));
  },
});
