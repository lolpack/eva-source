const assert = require('assert');
const {test} = require('./test-util');

module.exports = eva => {

  // Pass lambda as a callback

  test(eva,
  `
    (begin

      (var x 500)

      (switch ((= x 10) 100)
              ((< x 10) 200)
              ((> x 40) 500)
              (else     300))

    )

  `,
  500);

};