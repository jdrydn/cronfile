var async = require('async');
var later = require('later');

/**
 * A simple list of events so we know what is an event and what isn't!
 */
var EVENTS = [ 'start', 'stop' ];

/**
 * Introducing, the Cron!
 */
function Cron() {
  this._alias = {};
  this._help = {};

  this._crons = {};
  this._events = {};
}

/**
 * A mapping of times to aliases
 * See the README or aliases.json for the exact structure you can use
 */
Cron.prototype.aliases = function (mapping) {
  for (var time in mapping) /* istanbul ignore else */ if (mapping.hasOwnProperty(time)) {
    if (!Array.isArray(mapping[time])) mapping[time] = [ mapping[time] ];
    for (var i = 0; i < mapping[time].length; i++) this._alias[mapping[time][i]] = time;
  }
  return this;
};

var transformFns = function (fn) {
  if (fn.length === 0) return function (callback) {
    try {
      var r = fn();
      if (r && typeof r.then === 'function') {
        r.then(function () {
          callback();
        }, function (err) {
          callback(err);
        });
      }
      else callback();
    }
    catch (e) {
      callback(e);
    }
  };
  if (fn.length === 1) return fn;
};

/**
 * Adds functions to run when a specific cron-time is matched
 * A "cron-time" can be in the standard UNIX cron format OR a pre-defined alias OR it can be a specific event
 * Either way, it will be executed at runtime
 *
 * @param {String} cronTime A time, or an alias, or an event
 * (@param {String} cronDescription An optional description for the cron job)
 * @param {Function|Array[Function]} cronFn Functions expecting a single "callback" argument
 * @return {Cron} Returns the current instance for chaining
 */
Cron.prototype.on = function (cronTime, cronDescription, cronFn) {
  if (typeof cronDescription === 'function' || Array.isArray(cronDescription)) {
    cronFn = cronDescription;
    cronDescription = null;
  }

  var target = EVENTS.indexOf(cronTime.toString().toLowerCase()) >= 0 ? '_events' : '_crons';
  if (target === '_crons' && this._alias.hasOwnProperty(cronTime)) cronTime = this._alias[cronTime];

  this[target][cronTime] = this[target][cronTime] || [];
  if (Array.isArray(cronFn)) this[target][cronTime] = this[target][cronTime].concat(cronFn.map(transformFns));
  else this[target][cronTime].push(transformFns(cronFn));

  if (cronDescription) {
    this._help[target] = this._help[target] || {};
    this._help[target][cronTime] = this._help[target][cronTime] || [];
    this._help[target][cronTime].push(cronDescription);
  }

  return this;
};

Cron.prototype.list = function () {
  var out = [];

  if (this._events && this._events.start && this._events.start.length > 0) {
    out.push('start (' + this._events.start.length + ' event' + (this._events.start.length === 1 ? '' : 's') + ')');
    if (this._help._events && this._help._events.start) {
      out = out.concat(this._help._events.start.map(function (cronDescription) {
        return '- ' + cronDescription;
      }));
    }
    out.push('');
  }

  for (var time in this._crons) if (this._crons.hasOwnProperty(time)) {
    out.push(time + ' (' + this._crons[time].length + ' event' + (this._crons[time].length === 1 ? '' : 's') + ')');
    if (this._help._crons && this._help._crons[time]) {
      out = out.concat(this._help._crons[time].map(function (cronDescription) {
        return '- ' + cronDescription;
      }));
    }
    out.push('');
  }

  if (this._events && this._events.stop && this._events.stop.length > 0) {
    out.push('stop (' + this._events.stop.length + ' event' + (this._events.stop.length === 1 ? '' : 's') + ')');
    if (this._help._events && this._help._events.stop) {
      out = out.concat(this._help._events.stop.map(function (cronDescription) {
        return '- ' + cronDescription;
      }));
    }
  }

  return out.join('\n');
};

var run = false;
Cron.prototype.run = function (args, callback) {
  /* istanbul ignore next */
  if (!args && !callback) {
    args = process.argv.slice(2);
    callback = null;
  }

  if (typeof args === 'function') {
    callback = args;
    args = process.argv.slice(2);
  }

  /* istanbul ignore next */
  if (!callback) callback = function (err) {
    if (err) console.error(err.toString());
    process.exit(err ? 1 : 0);
  };

  if (run) return callback(Error('You cannot run the Cron library twice'));
  run = true;

  var date = new Date();

  /**
   * If we have a set of arguments, then run them.
   */
  if (args.length > 0) {
    /* istanbul ignore next */
    if (args[0] === 'list') {
      console.log(this.list());
      return callback();
    }
    else if (args[0] === 'test') {
      this._crons.every_minute = this._crons.every_minute || [];
      for (var p in this._crons) if (p !== 'every_minute' && this._crons.hasOwnProperty(p)) {
        this._crons.every_minute = this._crons.every_minute.concat(this._crons[p]);
        this._crons[p] = [];
      }
    }
    else if (args[0].indexOf(':') > 0) {
      date.setHours(
        parseInt(args[0].substr(0, args[0].indexOf(':')), 10),
        parseInt(args[0].substr(args[0].indexOf(':') + 1), 10)
      );
    }
  }

  date.setSeconds(0); // Date has seconds, and we don't want seconds

  var fns = [];
  Object.keys(this._crons).forEach(function (time) {
    if (later.schedule(later.parse.cron(time)).isValid(date)) fns = fns.concat(this._crons[time]);
  }.bind(this));

  async.series([].concat(
    Array.isArray(this._events.start) ? this._events.start : [],
    [ async.parallel.bind(async.parallel, fns) ],
    Array.isArray(this._events.stop) ? this._events.stop : []
  ), callback);
};

Cron.prototype.stop = function (callback) {
  async.series(Array.isArray(this._events.stop) ? this._events.stop : [], callback);
};

var cronfile = new Cron();
cronfile.aliases(require('./aliases.json'));

module.exports = cronfile;
