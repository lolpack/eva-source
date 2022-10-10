/**
 * Eva programming language.
 *
 * AST interpreter.
 *
 * Course info: http://dmitrysoshnikov.com/courses/essentials-of-interpretation/
 *
 * (C) 2018-present Dmitry Soshnikov <dmitry.soshnikov@gmail.com>
 */

const Environment = require('./Environment');
const Transformer = require('./transform/Transformer');
const evaParser = require('./parser/evaParser');

const fs = require('fs');

/**
 * Eva interpreter.
 */
class Eva {
  /**
   * Creates an Eva instance with the global environment.
   */
  constructor(global = GlobalEnvironment) {
    this.global = global;
    this._transformer = new Transformer();
  }

  /**
   * Evaluates global code wrapping into a block.
   */
  evalGlobal(exp) {
    return this._evalBody(exp, this.global);
  }

  /**
   * Evaluates an expression in the given environment.
   */
  eval(exp, env = this.global) {

    // --------------------------------------------
    // Self-evaluating expressions:

    if (this._isNumber(exp)) {
      return exp;
    }

    if (this._isString(exp)) {
      return exp.slice(1, -1);
    }

    // Moved to global environment
    // // --------------------------------------------
    // // Math operation

    // if (exp[0] === '+') {
    //   return this.eval(exp[1], env) + this.eval(exp[2], env);
    // }

    // if (exp[0] === '-') {
    //   return this.eval(exp[1], env) - this.eval(exp[2], env);
    // }

    // if (exp[0] === '*') {
    //   return this.eval(exp[1], env) * this.eval(exp[2], env);
    // }

    // if (exp[0] === '/') {
    //   return this.eval(exp[1], env) / this.eval(exp[2], env);
    // }

    // //--------------------------------------------
    // // Conditions

    // if (exp[0] === '>') {
    //   return this.eval(exp[1], env) > this.eval(exp[2], env);
    // }

    // if (exp[0] === '<') {
    //   return this.eval(exp[1], env) < this.eval(exp[2], env);
    // }

    // if (exp[0] === '>=') {
    //   return this.eval(exp[1], env) >= this.eval(exp[2], env);
    // }

    // if (exp[0] === '<=') {
    //   return this.eval(exp[1], env) <= this.eval(exp[2], env);
    // }

    // --------------------------------------------
    // Block: sequence of expressions

    if (exp[0] === 'begin') {
      const blockEnv = new Environment({}, env);
      return this._evalBlock(exp, blockEnv);
    }

    // --------------------------------------------
    // Variable declaration: (var foo 10)

    if (exp[0] === 'var') {
      const [ _, name, value ] = exp;
      return env.define(name, this.eval(value, env));
    }

    // --------------------------------------------
    // Variable update: (set foo 10)

    if (exp[0] === 'set') {
      const [ _, ref, value ] = exp;

      if (ref[0] === 'prop') {
        const [ _tag, instance, propName ] = ref;
        const instanceEnv = this.eval(instance, env);

        return instanceEnv.define(propName, this.eval(value, env));
      }

      // let environment = env.resolve(name);
      // environment.record[name] = this.eval(value, env);
      return env.assign(ref, this.eval(value, env));
    }

    // --------------------------------------------
    // Variable access: foo

    if (this._isVariableName(exp)) {
      return env.lookup(exp);
    }

    // --------------------------------------------
    // if-expression:

    if (exp[0] === 'if') {
      const [ _tag, condition, consequent, alternative ] = exp;
      if (this.eval(condition, env)) {
        return this.eval(consequent, env);
      }

      return this.eval(alternative, env);
    }

    // --------------------------------------------
    // while-expression:

    if (exp[0] === 'while') {
      const [ _tag, condition, body ] = exp;
      let result;

      while (this.eval(condition, env)) {
        result = this.eval(body, env);
      }

      return result;
    }

    // --------------------------------------------
    // Function declaration: (def square (x) (* x x))
    //
    // Syntactic sugar for: (var square (lambda (x) (* x x)))

    if (exp[0] === 'def') {
      const [ _tag, name, params, body ] = exp;

      // JIT transpile to variable declaration.

      const varExp = this._transformer.transformDefToVarLambda(exp);

      return this.eval(varExp, env);
    }

    // --------------------------------------------
    // Switch-expression: (switch (cond1, block1) ... )
    //
    // Syntactic sugar for nested if-expressions

    if (exp[0] === 'switch') {
      const ifExp = this._transformer.transformSwitchToIf(exp);

      return this.eval(ifExp, env);
    }

    // --------------------------------------------
    // For-loop: (for init condition modifier body )
    //
    // Syntactic sugar for: (begin init (while condition (begin body modifier)))

    if (exp[0] === 'for') {
      const whileExp = this._transformer.transformForToWhile(exp);

      return this.eval(whileExp, env);
    }

    // --------------------------------------------
    // Increment: (++ foo)
    //
    // Syntactic sugar for: (set foo (+ foo 1))

    if (exp[0] === '++') {
      const incToSetExp = this._transformer.transformIncToSet(exp);

      return this.eval(incToSetExp, env);
    }

    // --------------------------------------------
    // Decrement: (-- foo)
    //
    // Syntactic sugar for: (set foo (- foo 1))

    if (exp[0] === '--') {
      const decToSetExp = this._transformer.transformDecToSet(exp);

      return this.eval(decToSetExp, env);
    }

    // --------------------------------------------
    // Increment: (+= foo inc)
    //
    // Syntactic sugar for: (set foo (+ foo inc))

    if (exp[0] === '+=') {
      const incValToSetExp = this._transformer.transformIncValToSet(exp);

      return this.eval(incValToSetExp, env);
    }

    // --------------------------------------------
    // Decrement: (-= foo dec)
    //
    // Syntactic sugar for: (set foo (- foo dec))

    if (exp[0] === '-=') {
      const decValToSetExp = this._transformer.transformDecValToSet(exp);

      return this.eval(decValToSetExp, env);
    }

    // --------------------------------------------
    // Lambda function: (lambda (x) (* x x))

    if (exp[0] === 'lambda') {
      const [ _tag, params, body ] = exp;

      return {
        params,
        body,
        env, // closure
      };
    }

    // --------------------------------------------
    // Class declaration: (class <Name> <Parent> <Body>)

    if (exp[0] === 'class') {
      const [_tag, name, parent, body] = exp;

      const parentEnv = this.eval(parent, env) || env;

      const classEnv = new Environment({}, parentEnv);

      this._evalBody(body, classEnv);

      // Class is accessible by name.

      return env.define(name, classEnv);
    }

    // --------------------------------------------
    // Super expressions: (super <ClassName>)

    if (exp[0] === 'super') {
      const [ _tag, className ] = exp;
      return this.eval(className, env).parent;
    }

    // --------------------------------------------
    // Class instantiation: (new <Class> <Arguments>...)

    if (exp[0] === 'new') {

      const classEnv = this.eval(exp[1]);

      const instanceEnv = new Environment({}, classEnv);

      const args = exp.slice(2).map(arg => this.eval(arg, env));

      this._callUserDefinedFunction(classEnv.lookup('constructor'), 
        [instanceEnv, ...args])

      return instanceEnv;
    }

    // --------------------------------------------
    // Property access: (prop <instance> <name>)

    if (exp[0] === 'prop') {
      const [_tag, instance, name] = exp;

      const instanceEnv = this.eval(instance, env);

      return instanceEnv.lookup(name);
    }

    // --------------------------------------------
    // Module declaration: (module <name> <body>)

    if (exp[0] === 'module') {
      const [ _tag, name, body ] = exp;

      const moduleEnv = new Environment({}, env);

      this._evalBody(body, moduleEnv);

      return env.define(name, moduleEnv);
    }

    // --------------------------------------------
    // Module import: (import <name>)
    // (import (export1, export2, ...) <name>)

    if (exp[0] === 'import') {
      const [ _tag, name] = exp;

      const moduleSrc = fs.readFileSync(
        `./modules/${name}.eva`,
        'utf-8',
      );

      const body = evaParser.parse(`(begin ${moduleSrc})`);

      const moduleExp = ['module', name, body];

      return this.eval(moduleExp, this.global);
    }

    // --------------------------------------------
    // Function calls:
    //
    // (print "Hello World")
    // (+ x 5)
    // (> foo bar)

    if (Array.isArray(exp)) {

      const fn = this.eval(exp[0], env);

      const args = exp
        .slice(1)
        .map(arg => this.eval(arg, env));

      // 1. Native function:

      // See Lecture 10

      if (typeof fn === 'function') {
        return fn(...args);
      }

      // 2. User-defined function:

      return this._callUserDefinedFunction(fn, args);
    }


    throw `Unimplemented: ${JSON.stringify(exp)}`;
  }

  _callUserDefinedFunction(fn, args) {
    const activationRecord = {};

    fn.params.forEach((param, index) => {
      activationRecord[param] = args[index];
    });

    const activationEnv = new Environment(
      activationRecord,
      fn.env,
    );

    return this._evalBody(fn.body, activationEnv);
  }

  _evalBody(body, env) {
    if (body[0] === 'begin') {
      return this._evalBlock(body, env);
    }
    return this.eval(body, env);
  }

  _evalBlock(block, env) {
    let result;

    const [ _tag, ...expressions ] = block;

    expressions.forEach(expression  => {
      result = this.eval(expression, env);
    });

    return result;
  }

  _isNumber(exp) {
    return typeof exp === 'number';
  }

  _isString(exp) {
    return typeof exp === 'string' && exp[0] === '"' && exp.slice(-1) === '"';
  }

  _isVariableName(exp) {
    return typeof exp === 'string' && /^[+\-*/<>=a-zA-Z0-9_]+$/.test(exp);
  }
}

/**
 * Default Global Environment.
 */
const GlobalEnvironment = new Environment({
  null: null,

  true: true,
  false: false,

  VERSION: '0.1',

  // Operators:

  '+'(op1, op2) {
    return op1 + op2;
  },

  '*'(op1, op2) {
    return op1 * op2;
  },

  '-'(op1, op2 = null) {
    if (op2 == null) {
      return -op1;
    }
    return op1 - op2;
  },

  '/'(op1, op2) {
    return op1 / op2;
  },

  // Comparison:

  '>'(op1, op2) {
    return op1 > op2;
  },

  '<'(op1, op2) {
    return op1 < op2;
  },

  '>='(op1, op2) {
    return op1 >= op2;
  },

  '<='(op1, op2) {
    return op1 <= op2;
  },

  '='(op1, op2) {
    return op1 === op2;
  },

  // Console output:

  print(...args) {
    console.log(...args);
  },
});


module.exports = Eva;