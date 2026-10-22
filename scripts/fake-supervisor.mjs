/**
 * Stand-in for the Supervisor auth API, for testing the app's login without
 * Home Assistant. It accepts one user, admin with password secret123, when the
 * request carries the token test-token, as the app does with SUPERVISOR_TOKEN.
 * See .docs/development.md for how to run it next to the app.
 */

import { createServer } from 'node:http';

/** @type {string} Authorization header of the one valid login. */
const VALID_LOGIN = `Basic ${ Buffer.from( 'admin:secret123' ).toString( 'base64' ) }`;

/** @type {string} Token the app must send as X-Supervisor-Token. */
const VALID_TOKEN = 'test-token';

/** @type {number} Delay before answering, like Home Assistant checking a password. */
const ANSWER_DELAY_MS = 300;

/** @type {number} Port to listen on; the app expects http://supervisor/auth. */
const PORT = 80;

/** @type {number} Number of login checks received, to see the app's caching at work. */
let checks = 0;

/**
 * Answers a login check like the Supervisor: 200 for a valid login, 401 otherwise.
 *
 * @param {import('node:http').IncomingMessage} req Login check from the app.
 * @param {import('node:http').ServerResponse} res Response to the app.
 * @returns {void}
 */
function handleRequest( req, res )
{
  checks += 1;

  const valid = req.method === 'POST'
    && req.url === '/auth'
    && req.headers[ 'x-supervisor-token' ] === VALID_TOKEN
    && req.headers.authorization === VALID_LOGIN;

  console.log( `Check ${ checks }: ${ req.method } ${ req.url } -> ${ valid ? 200 : 401 }` );

  setTimeout( () =>
  {
    res.writeHead( valid ? 200 : 401 );
    res.end();
  }, ANSWER_DELAY_MS );
}

createServer( handleRequest ).listen( PORT );
