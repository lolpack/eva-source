const assert = require('assert');

module.exports = eva => {
  assert.strictEqual(eva.eval(['+', 1, 5]), 6);
  assert.strictEqual(eva.eval(['-', 6, 5]), 1);
  assert.strictEqual(eva.eval(['/', 5, 5]), 1);
  assert.strictEqual(eva.eval(['*', 6, 5]), 30);
  assert.strictEqual(eva.eval(['+', ['+', 3, 2], 5]), 10);
  assert.strictEqual(eva.eval(['+', ['*', 3, 2], 5]), 11);
};