// input.js — raw keyboard input, normalized to semantic key names, with a
// promise-based next() and an event emitter. Movement consumers can treat
// w/a/s/d the same as the arrow keys.

import { EventEmitter } from 'node:events';

const SEQ = {
  '\x1b[A': 'up', '\x1b[B': 'down', '\x1b[C': 'right', '\x1b[D': 'left',
  '\x1bOA': 'up', '\x1bOB': 'down', '\x1bOC': 'right', '\x1bOD': 'left',
  '\r': 'enter', '\n': 'enter',
  ' ': 'space',
  '\t': 'tab',
  '\x1b': 'esc',
  '\x7f': 'back', '\b': 'back',
  '\x03': 'ctrl-c',
};

const ALIASES = {
  w: 'up', s: 'down', a: 'left', d: 'right',
  k: 'up', j: 'down', h: 'left', l: 'right',
  z: 'enter', x: 'esc',
};

function decode(strRaw) {
  const str = strRaw.toString('utf8');
  if (SEQ[str]) return [SEQ[str]];
  // an unrecognized escape sequence (e.g. function key) -> treat as esc
  if (str[0] === '\x1b') return ['esc'];
  // possibly several characters typed quickly
  const out = [];
  for (const ch of str) {
    if (SEQ[ch]) out.push(SEQ[ch]);
    else out.push(ch.toLowerCase());
  }
  return out;
}

export class Input extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.waiters = [];
    this.started = false;
    this.movementAsArrows = true;
    this._onData = this._onData.bind(this);
  }

  start() {
    if (this.started) return;
    this.started = true;
    const s = process.stdin;
    if (s.isTTY) s.setRawMode(true);
    s.resume();
    s.on('data', this._onData);
  }

  stop() {
    if (!this.started) return;
    const s = process.stdin;
    s.off('data', this._onData);
    if (s.isTTY) s.setRawMode(false);
    s.pause();
    this.started = false;
  }

  _norm(k) {
    if (this.movementAsArrows && ALIASES[k]) return ALIASES[k];
    return k;
  }

  _onData(buf) {
    for (const raw of decode(buf)) {
      if (raw === 'ctrl-c') { this.emit('quit'); return; }
      const k = this._norm(raw);
      this.emit('key', k);
      if (this.waiters.length) this.waiters.shift()(k);
      else this.queue.push(k);
    }
  }

  // resolve with the next key (semantic name)
  next() {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise((res) => this.waiters.push(res));
  }

  // discard any buffered keys (call before a menu to avoid stray input)
  drain() { this.queue.length = 0; }
}
