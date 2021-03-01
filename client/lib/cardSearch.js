export class CardSearchPagedComponent extends BlazeComponent {
  onCreated() {
    this.searching = new ReactiveVar(false);
    this.hasResults = new ReactiveVar(false);
    this.hasQueryErrors = new ReactiveVar(false);
    this.query = new ReactiveVar('');
    this.resultsHeading = new ReactiveVar('');
    this.searchLink = new ReactiveVar(null);
    this.results = new ReactiveVar([]);
    this.hasNextPage = new ReactiveVar(false);
    this.hasPreviousPage = new ReactiveVar(false);
    this.resultsCount = 0;
    this.totalHits = 0;
    this.queryErrors = null;
    this.resultsPerPage = 25;
  }

  resetSearch() {
    this.searching.set(false);
    this.results.set([]);
    this.hasResults.set(false);
    this.hasQueryErrors.set(false);
    this.resultsHeading.set('');
    this.resultsCount = 0;
    this.totalHits = 0;
    this.queryErrors = null;
  }

  getSessionData() {
    return SessionData.findOne({
      userId: Meteor.userId(),
      sessionId: SessionData.getSessionId(),
    });
  }

  getResults() {
    // eslint-disable-next-line no-console
    // console.log('getting results');
    const sessionData = this.getSessionData();
    // eslint-disable-next-line no-console
    // console.log('selector:', sessionData.getSelector());
    console.log('session data:', sessionData);
    const projection = sessionData.getProjection();
    projection.skip = 0;
    const cards = Cards.find({ _id: { $in: sessionData.cards } }, projection);
    this.queryErrors = sessionData.errors;
    if (this.queryErrors.length) {
      this.hasQueryErrors.set(true);
      return null;
    }

    if (cards) {
      this.totalHits = sessionData.totalHits;
      this.resultsCount = cards.count();
      this.resultsStart = sessionData.lastHit - this.resultsCount + 1;
      this.resultsEnd = sessionData.lastHit;
      this.resultsHeading.set(this.getResultsHeading());
      this.results.set(cards);
      this.hasNextPage.set(sessionData.lastHit < sessionData.totalHits);
      this.hasPreviousPage.set(
        sessionData.lastHit - sessionData.resultsCount > 0,
      );
      return cards;
    }

    this.resultsCount = 0;
    return null;
  }

  autorunGlobalSearch(params) {
    this.searching.set(true);

    this.autorun(() => {
      const handle = Meteor.subscribe(
        'globalSearch',
        SessionData.getSessionId(),
        params,
      );
      Tracker.nonreactive(() => {
        Tracker.autorun(() => {
          if (handle.ready()) {
            this.getResults();
            this.searching.set(false);
            this.hasResults.set(true);
          }
        });
      });
    });
  }

  queryErrorMessages() {
    const messages = [];

    this.queryErrors.forEach(err => {
      let value = err.color ? TAPi18n.__(`color-${err.value}`) : err.value;
      if (!value) {
        value = err.value;
      }
      messages.push(TAPi18n.__(err.tag, value));
    });

    return messages;
  }

  nextPage() {
    const sessionData = this.getSessionData();

    this.autorun(() => {
      const handle = Meteor.subscribe('nextPage', sessionData.sessionId);
      Tracker.nonreactive(() => {
        Tracker.autorun(() => {
          if (handle.ready()) {
            this.getResults();
            this.searching.set(false);
            this.hasResults.set(true);
          }
        });
      });
    });
  }

  previousPage() {
    const sessionData = this.getSessionData();

    this.autorun(() => {
      const handle = Meteor.subscribe('previousPage', sessionData.sessionId);
      Tracker.nonreactive(() => {
        Tracker.autorun(() => {
          if (handle.ready()) {
            this.getResults();
            this.searching.set(false);
            this.hasResults.set(true);
          }
        });
      });
    });
  }

  getResultsHeading() {
    if (this.resultsCount === 0) {
      return TAPi18n.__('no-cards-found');
    } else if (this.resultsCount === 1) {
      return TAPi18n.__('one-card-found');
    } else if (this.resultsCount === this.totalHits) {
      return TAPi18n.__('n-cards-found', this.resultsCount);
    }

    return TAPi18n.__('n-n-of-n-cards-found', {
      start: this.resultsStart,
      end: this.resultsEnd,
      total: this.totalHits,
    });
  }

  getSearchHref() {
    const baseUrl = window.location.href.replace(/([?#].*$|\s*$)/, '');
    return `${baseUrl}?q=${encodeURIComponent(this.query.get())}`;
  }

  events() {
    return [
      {
        'click .js-next-page'(evt) {
          evt.preventDefault();
          this.nextPage();
        },
        'click .js-previous-page'(evt) {
          evt.preventDefault();
          this.previousPage();
        },
      },
    ];
  }
}
