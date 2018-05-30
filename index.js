'use strict'

/*!
 * method-override
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2014 Douglas Christopher Wilson
 * Copyright(c) 2015 Fangdun Cai
 * MIT Licensed
 */

/**
 * Module dependences.
 */

const debug = require('debug')('method-override')
const methods = require('methods')
const asyncBusboy = require('async-busboy')

const ALLOWED_METHODS = 'POST'
const HTTP_METHOD_OVERRIDE_HEADER = "X-HTTP-Method-Override"

let asyncBusboyBody = null

/**
 * Method Override:
 *
 * Provides faux HTTP method support.
 *
 * Pass an optional `getter` to use when checking for
 * a method override.
 *
 * A string is converted to a getter that will look for
 * the method in `req.body[getter]` and a function will be
 * called with `req` and expects the method to be returned.
 * If the string starts with `X-` then it will look in
 * `req.headers[getter]` instead.
 *
 * The original method is available via `req.originalMethod`.
 *
 * @param {string|function} [getter=X-HTTP-Method-Override]
 * @param {object} [options]
 * @return {function}
 * @api public
 */

module.exports = methodOverride

function methodOverride(getter, options) {
  options = options || {}

  // get the getter fn
  const get = typeof getter === 'function'
    ? getter
    : createGetter(getter || HTTP_METHOD_OVERRIDE_HEADER)

  // get allowed request methods to examine
  const methods = options.methods === undefined
    ? ALLOWED_METHODS.split(' ')
    : options.methods

  return async (ctx, next) => {
    const req = ctx.request
    let method
    let val

    req.originalMethod = req.originalMethod || req.method

    // validate request is an allowed method
    if (methods && methods.indexOf(req.originalMethod) === -1) {
      return next()
    }

    asyncBusboyBody = null
    ctx.req.getAsyncBusboyBody = async () => (asyncBusboyBody || await asyncBusboy(ctx.req))

    val = await get(req, ctx.response, ctx.req)
    method = Array.isArray(val) ? val[0] : val

    // replace
    if (method !== undefined && supports(method)) {
      req.method = method.toUpperCase()
      debug(`override ${req.originalMethod} as ${req.method}`)
    }

    return next()
  }
}

/**
 * Create a getter for the given string.
 */

function createGetter(str) {
  if (str.substring(0, 2).toUpperCase() === 'X-') {
    // header getter
    return createHeaderGetter(str)
  }

  return createQueryOrBodyGetter(str)
}

/**
 * Create a getter for the given query or body key name.
 */

function createQueryOrBodyGetter(key) {
  return queryOrBodyGetter

  async function queryOrBodyGetter(req, ...args) {
    const method = req.query[key] || (req.body && req.body[key])
    if (method) {
      return method
    } else {
      const koaReq = args[1]
      asyncBusboyBody = await asyncBusboy(koaReq)
      return asyncBusboyBody.fields[key]
    }
  }
}

/**
 * Create a getter for the given header name.
 */

function createHeaderGetter(str) {
  var header = str.toLowerCase()

  return headerGetter

  function headerGetter(req, res) {
    // set appropriate Vary header
    res.vary(str)

    // multiple headers get joined with comma by node.js core
    return (req.headers[header] || '').split(/ *, */)
  }
}

/**
 * Check if node supports `method`.
 */

function supports(method) {
  return method
    && typeof method === 'string'
    && methods.indexOf(method.toLowerCase()) !== -1
}
