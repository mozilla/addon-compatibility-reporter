/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

module.metadata = {
  "stability": "stable"
};

const observers = require('sdk/system/events');
const { contract: loaderContract } = require('sdk/content/loader');
const { contract } = require('sdk/util/contract');
const { getAttachEventType, WorkerHost } = require('sdk/content/utils');
const { Class } = require('sdk/core/heritage');
const { Disposable } = require('sdk/core/disposable');
const { WeakReference } = require('sdk/core/reference');
try {
    var { Worker } = require('sdk/deprecated/sync-worker');
}
catch (e) {
    var { Worker } = require('sdk/content/worker');
}
const { EventTarget } = require('sdk/event/target');
const { on, emit, once, setListeners } = require('sdk/event/core');
const { on: domOn, removeListener: domOff } = require('sdk/dom/events');
const { pipe } = require('sdk/event/utils');
const { isRegExp, isUndefined } = require('sdk/lang/type');
const { merge } = require('sdk/util/object');
const { windowIterator } = require('sdk/deprecated/window-utils');
const { isBrowser, getFrames } = require('sdk/window/utils');
const { getTabs, getTabContentWindow, getTabForContentWindow,
        getURI: getTabURI } = require('sdk/tabs/utils');
const { ignoreWindow } = require('sdk/private-browsing/utils');
const { Style } = require("sdk/stylesheet/style");
const { attach, detach } = require("sdk/content/mod");
const { has, hasAny } = require("sdk/util/array");
const { Rules } = require("sdk/util/rules");
const { List, addListItem, removeListItem } = require('sdk/util/list');
const { when: unload } = require("sdk/system/unload");

// Valid values for `attachTo` option
const VALID_ATTACHTO_OPTIONS = ['existing', 'top', 'frame'];

const pagemods = new Set();
const workers = new WeakMap();
const styles = new WeakMap();
const models = new WeakMap();
let modelFor = (mod) => models.get(mod);
let workerFor = (mod) => workers.get(mod);
let styleFor = (mod) => styles.get(mod);

// Bind observer
observers.on('chrome-document-global-created', onContentWindow);
unload(() => observers.off('chrome-document-global-created', onContentWindow));

// Helper functions
let isRegExpOrString = (v) => isRegExp(v) || typeof v === 'string';
let modMatchesURI = (mod, uri) => mod.include.matchesAny(uri) && !mod.exclude.matchesAny(uri);

// Validation Contracts
const modOptions = {
  // contentStyle* / contentScript* are sharing the same validation constraints,
  // so they can be mostly reused, except for the messages.
  contentStyle: merge(Object.create(loaderContract.rules.contentScript), {
    msg: 'The `contentStyle` option must be a string or an array of strings.'
  }),
  contentStyleFile: merge(Object.create(loaderContract.rules.contentScriptFile), {
    msg: 'The `contentStyleFile` option must be a local URL or an array of URLs'
  }),
  include: {
    is: ['string', 'array', 'regexp'],
    ok: (rule) => {
      if (isRegExpOrString(rule))
        return true;
      if (Array.isArray(rule) && rule.length > 0)
        return rule.every(isRegExpOrString);
      return false;
    },
    msg: 'The `include` option must always contain atleast one rule as a string, regular expression, or an array of strings and regular expressions.'
  },
  exclude: {
    is: ['string', 'array', 'regexp', 'undefined'],
    ok: (rule) => {
      if (isRegExpOrString(rule) || isUndefined(rule))
        return true;
      if (Array.isArray(rule) && rule.length > 0)
        return rule.every(isRegExpOrString);
      return false;
    },
    msg: 'If set, the `exclude` option must always contain at least one ' +
      'rule as a string, regular expression, or an array of strings and ' +
      'regular expressions.'
  },
  attachTo: {
    is: ['string', 'array', 'undefined'],
    map: function (attachTo) {
      if (!attachTo) return ['top', 'frame'];
      if (typeof attachTo === 'string') return [attachTo];
      return attachTo;
    },
    ok: function (attachTo) {
      return hasAny(attachTo, ['top', 'frame']) &&
        attachTo.every(has.bind(null, ['top', 'frame', 'existing']));
    },
    msg: 'The `attachTo` option must be a string or an array of strings. ' +
      'The only valid options are "existing", "top" and "frame", and must ' +
      'contain at least "top" or "frame" values.'
  },
};

const modContract = contract(merge({}, loaderContract.rules, modOptions));

/**
 * ChromeMod constructor (exported below).
 * @constructor
 */
const ChromeMod = Class({
  implements: [
    modContract.properties(modelFor),
    EventTarget,
    Disposable,
    WeakReference
  ],
  extends: WorkerHost(workerFor),
  setup: function ChromeMod(options) {
    let mod = this;
    let model = modContract(options);
    models.set(this, model);

    // Set listeners on {ChromeMod} itself, not the underlying worker,
    // like `onMessage`, as it'll get piped.
    setListeners(this, options);

    let include = model.include;
    model.include = Rules();
    model.include.add.apply(model.include, [].concat(include));

    let exclude = isUndefined(model.exclude) ? [] : model.exclude;
    model.exclude = Rules();
    model.exclude.add.apply(model.exclude, [].concat(exclude));

    if (model.contentStyle || model.contentStyleFile) {
      styles.set(mod, Style({
        uri: model.contentStyleFile,
        source: model.contentStyle
      }));
    }

    pagemods.add(this);
    model.seenDocuments = new WeakMap();

    // `applyOnExistingDocuments` has to be called after `pagemods.add()`
    // otherwise its calls to `onContent` method won't do anything.
    if (has(model.attachTo, 'existing'))
      applyOnExistingDocuments(mod);
  },

  dispose: function() {
    let style = styleFor(this);
    if (style)
      detach(style);

    for (let i in this.include)
      this.include.remove(this.include[i]);

    pagemods.delete(this);
  }
});
exports.ChromeMod = ChromeMod;

function onContentWindow({ subject: window }) {
  // Return if we have no pagemods
  if (pagemods.size === 0)
    return;

  // We apply only on documents in tabs of Firefox
  if (!getTabForContentWindow(window))
    return;

  // When the tab is private, only addons with 'private-browsing' flag in
  // their package.json can apply content script to private documents
  if (ignoreWindow(window))
    return;

  for (let pagemod of pagemods) {
    if (modMatchesURI(pagemod, window.document.URL))
      onContent(pagemod, window);
  }
}

function applyOnExistingDocuments (mod) {
  getTabs().forEach(tab => {
    // Fake a newly created document
    let window = getTabContentWindow(tab);
    let uri = getTabURI(tab);
    if (has(mod.attachTo, "top") && modMatchesURI(mod, uri))
      onContent(mod, window);
    if (has(mod.attachTo, "frame"))
      getFrames(window).
        filter(iframe => modMatchesURI(mod, iframe.location.href)).
        forEach(frame => onContent(mod, frame));
  });
}

function createWorker (mod, window) {
  let worker = Worker({
    window: window,
    contentScript: mod.contentScript,
    contentScriptFile: mod.contentScriptFile,
    contentScriptOptions: mod.contentScriptOptions,
    // Bug 980468: Syntax errors from scripts can happen before the worker
    // can set up an error handler. They are per-mod rather than per-worker
    // so are best handled at the mod level.
    onError: (e) => emit(mod, 'error', e)
  });
  workers.set(mod, worker);
  pipe(worker, mod);
  emit(mod, 'attach', worker);
  once(worker, 'detach', function detach() {
    worker.destroy();
  });
}

function onContent (mod, window) {
  // not registered yet
  if (!pagemods.has(mod))
    return;

  let isTopDocument = window.top === window;
  // Is a top level document and `top` is not set, ignore
  if (isTopDocument && !has(mod.attachTo, "top"))
    return;
  // Is a frame document and `frame` is not set, ignore
  if (!isTopDocument && !has(mod.attachTo, "frame"))
    return;

  // ensure we attach only once per document
  let seen = modelFor(mod).seenDocuments;
  if (seen.has(window.document))
    return;
  seen.set(window.document, true);

  let style = styleFor(mod);
  if (style)
    attach(style, window);

  // Immediatly evaluate content script if the document state is already
  // matching contentScriptWhen expectations
  if (isMatchingAttachState(mod, window)) {
    createWorker(mod, window);
    return;
  }

  let eventName = getAttachEventType(mod) || 'load';
  domOn(window, eventName, function onReady (e) {
    if (e.target.defaultView !== window)
      return;
    domOff(window, eventName, onReady, true);
    createWorker(mod, window);
  }, true);
}

function isMatchingAttachState (mod, window) {
  let state = window.document.readyState;
  return 'start' === mod.contentScriptWhen ||
      // Is `load` event already dispatched?
      'complete' === state ||
      // Is DOMContentLoaded already dispatched and waiting for it?
      ('ready' === mod.contentScriptWhen && state === 'interactive')
}
