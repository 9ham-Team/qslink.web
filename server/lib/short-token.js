'use strict';
const crypto = require('crypto');
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function createShortToken(cards) {
  const used = new Set(cards.flatMap(card => [card.shortToken, card.shareToken]));
  for (;;) {
    let token = '';
    while (token.length < 6) token += ALPHABET[crypto.randomInt(ALPHABET.length)];
    if (!used.has(token)) return token;
  }
}

module.exports = { createShortToken };
