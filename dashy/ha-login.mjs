/**
 * Login check for the Dashy app. nginx asks it, through auth_request, whether a
 * request may reach Dashy. It checks the browser's Basic credentials against the
 * Home Assistant users through the Supervisor auth API, remembers successful
 * logins for a few minutes, and locks out addresses after repeated failures.
 */

import { createServer, request } from 'node:http';
import { createHash } from 'node:crypto';

/** @type {number} Port nginx sends the login checks to, on the loopback address. */
const PORT = Number( process.env.LOGIN_CHECK_PORT || 8082 );

/** @type {string} Supervisor endpoint that validates Home Assistant credentials. */
const SUPERVISOR_AUTH_URL = process.env.SUPERVISOR_AUTH_URL || 'http://supervisor/auth';

/** @type {string} Token that identifies this app to the Supervisor. */
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN || '';

/** @type {string[]} Lower-case user names that may log in; empty allows every Home Assistant user. */
const ALLOWED_USERS = parseAllowedUsers( process.env.ALLOWED_USERS || '' );

/** @type {string} Challenge that makes the browser show its login window. */
const CHALLENGE = 'Basic realm="Dashy", charset="UTF-8"';

/** @type {number} How long a successful login is trusted before it is checked again. */
const SUCCESS_TTL_MS = 5 * 60 * 1000;

/** @type {number} Period over which the failed logins of one address are counted. */
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

/** @type {number} Number of different wrong credentials one address may try within the window. */
const MAX_FAILURES = 10;

/** @type {number} How long an address stays locked out after too many failed logins. */
const LOCKOUT_MS = 15 * 60 * 1000;

/** @type {number} Time the Supervisor gets to answer; Home Assistant can take a few seconds. */
const SUPERVISOR_TIMEOUT_MS = 10 * 1000;

/** @type {number} Upper bound of remembered logins and tracked addresses, to cap memory use. */
const MAX_ENTRIES = 1000;

/** @type {number} Interval at which expired entries are removed. */
const PRUNE_INTERVAL_MS = 60 * 1000;

/** @type {number} Longest user name written to the log. */
const MAX_LOGGED_NAME_LENGTH = 64;

/** @type {Map<string, number>} Expiry time per hash of credentials that were accepted. */
const acceptedLogins = new Map();

/** @type {Map<string, Promise<boolean>>} Supervisor checks in progress, per hash of credentials. */
const pendingChecks = new Map();

/** @type {Map<string, { since: number, hashes: Set<string>, lockedUntil: number }>} Failed logins per client address. */
const failures = new Map();

/**
 * Reads the allowed user names from the JSON array that run.sh passes in.
 *
 * @param {string} value JSON array of user names.
 * @returns {string[]} Lower-case user names; empty when none are set or the value is invalid.
 */
function parseAllowedUsers( value )
{
  if ( value === '' )
  {
    return [];
  }

  try
  {
    const parsed = JSON.parse( value );

    if ( !Array.isArray( parsed ) )
    {
      return [];
    }

    return parsed
      .filter( ( name ) => typeof name === 'string' && name.trim() !== '' )
      .map( ( name ) => name.trim().toLowerCase() );
  }
  catch
  {
    return [];
  }
}

/**
 * Writes a message to the app log, in the same form as run.sh.
 *
 * @param {string} message Text to log.
 * @returns {void}
 */
function log( message )
{
  console.log( `[dashy-app] ${ message }` );
}

/**
 * Makes a user name typed by a visitor safe to write to the log: control
 * characters, such as line breaks that could fake log lines, are replaced, and
 * long names are cut off.
 *
 * @param {string} username User name from the browser.
 * @returns {string} The user name, safe to log.
 */
function loggableName( username )
{
  const safe = username.replace( /[\u0000-\u001f\u007f-\u009f]/g, '?' );

  if ( safe.length <= MAX_LOGGED_NAME_LENGTH )
  {
    return safe;
  }

  return `${ safe.slice( 0, MAX_LOGGED_NAME_LENGTH ) }...`;
}

/**
 * Hashes an Authorization header, so credentials are never kept in memory as text.
 *
 * @param {string} header Value of the Authorization header.
 * @returns {string} Hex SHA-256 hash of the header.
 */
function hashCredentials( header )
{
  return createHash( 'sha256' ).update( header ).digest( 'hex' );
}

/**
 * Takes the user name out of a Basic Authorization header.
 *
 * @param {string} header Value of the Authorization header.
 * @returns {string} The user name, or an empty string when the header is no valid Basic login.
 */
function basicUsername( header )
{
  if ( !header.startsWith( 'Basic ' ) )
  {
    return '';
  }

  const decoded = Buffer.from( header.slice( 'Basic '.length ), 'base64' ).toString( 'utf8' );
  const separator = decoded.indexOf( ':' );

  if ( separator < 1 )
  {
    return '';
  }

  return decoded.slice( 0, separator );
}

/**
 * Adds an entry to a map, dropping the oldest entry first when the map is full.
 *
 * @param {Map<string, any>} map Map to add to.
 * @param {string} key Key of the new entry.
 * @param {any} value Value of the new entry.
 * @returns {void}
 */
function setBounded( map, key, value )
{
  if ( !map.has( key ) && map.size >= MAX_ENTRIES )
  {
    map.delete( map.keys().next().value );
  }

  map.set( key, value );
}

/**
 * Tells whether an address is locked out after too many failed logins.
 *
 * @param {string} address Client IP address.
 * @param {number} now Current time in milliseconds.
 * @returns {boolean} True while the address is locked out.
 */
function isLockedOut( address, now )
{
  const entry = failures.get( address );

  return entry !== undefined && entry.lockedUntil > now;
}

/**
 * Counts a failed login for an address, and locks the address out once it tried
 * too many different wrong credentials. The browser repeats the same wrong
 * credentials for every file of the page, so those count once.
 *
 * @param {string} address Client IP address.
 * @param {string} hash Hash of the rejected credentials.
 * @param {string} username User name that was tried.
 * @param {number} now Current time in milliseconds.
 * @returns {void}
 */
function recordFailure( address, hash, username, now )
{
  let entry = failures.get( address );

  if ( entry === undefined || now - entry.since > FAILURE_WINDOW_MS )
  {
    entry = { since: now, hashes: new Set(), lockedUntil: 0 };
    setBounded( failures, address, entry );
  }

  if ( entry.hashes.has( hash ) )
  {
    return;
  }

  entry.hashes.add( hash );
  log( `Failed login for '${ loggableName( username ) }' from ${ address }.` );

  if ( entry.hashes.size >= MAX_FAILURES )
  {
    entry.lockedUntil = now + LOCKOUT_MS;
    log( `Too many failed logins from ${ address }; locked out for ${ LOCKOUT_MS / 60000 } minutes.` );
  }
}

/**
 * Asks the Supervisor whether the credentials belong to a Home Assistant user.
 *
 * @param {string} header Basic Authorization header from the browser.
 * @returns {Promise<boolean>} True for valid credentials, false for invalid ones.
 */
function askSupervisor( header )
{
  return new Promise( ( resolve, reject ) =>
  {
    const supervisorRequest = request( SUPERVISOR_AUTH_URL, {
      method: 'POST',
      timeout: SUPERVISOR_TIMEOUT_MS,
      headers: {
        'Authorization': header,
        'X-Supervisor-Token': SUPERVISOR_TOKEN,
        'Content-Length': 0,
      },
    }, ( response ) =>
    {
      response.resume();

      if ( response.statusCode === 200 )
      {
        resolve( true );
        return;
      }

      if ( response.statusCode === 401 || response.statusCode === 400 )
      {
        resolve( false );
        return;
      }

      reject( new Error( `Supervisor auth API answered with HTTP ${ response.statusCode }` ) );
    } );

    supervisorRequest.on( 'timeout', () => supervisorRequest.destroy( new Error( 'Supervisor auth API timed out' ) ) );
    supervisorRequest.on( 'error', reject );
    supervisorRequest.end();
  } );
}

/**
 * Checks credentials with the Supervisor, sharing one check between the many
 * requests a browser sends at once when a page loads.
 *
 * @param {string} header Basic Authorization header from the browser.
 * @param {string} hash Hash of the header.
 * @returns {Promise<boolean>} True for valid credentials, false for invalid ones.
 */
function checkCredentials( header, hash )
{
  const pending = pendingChecks.get( hash );

  if ( pending !== undefined )
  {
    return pending;
  }

  const check = askSupervisor( header ).finally( () => pendingChecks.delete( hash ) );
  pendingChecks.set( hash, check );

  return check;
}

/**
 * Sends an empty response to nginx.
 *
 * @param {import('node:http').ServerResponse} res Response to send.
 * @param {number} status 204 to let the request through, 401 to ask for a login, 403 to refuse.
 * @returns {void}
 */
function respond( res, status )
{
  if ( status === 401 )
  {
    res.setHeader( 'WWW-Authenticate', CHALLENGE );
  }

  res.writeHead( status );
  res.end();
}

/**
 * Decides whether the request that nginx is about to pass to Dashy may go through.
 *
 * @param {import('node:http').IncomingMessage} req Login check from nginx, carrying the browser's headers.
 * @param {import('node:http').ServerResponse} res Response to nginx.
 * @returns {Promise<void>} Resolves once the response is sent.
 */
async function handleRequest( req, res )
{
  const now = Date.now();
  const address = String( req.headers[ 'x-real-ip' ] || req.socket.remoteAddress || '' );
  const header = String( req.headers.authorization || '' );

  if ( isLockedOut( address, now ) )
  {
    respond( res, 403 );
    return;
  }

  const username = basicUsername( header );

  if ( username === '' )
  {
    respond( res, 401 );
    return;
  }

  const hash = hashCredentials( header );

  if ( ( acceptedLogins.get( hash ) || 0 ) > now )
  {
    respond( res, 204 );
    return;
  }

  if ( ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes( username.toLowerCase() ) )
  {
    recordFailure( address, hash, username, now );
    respond( res, 401 );
    return;
  }

  try
  {
    if ( !await checkCredentials( header, hash ) )
    {
      recordFailure( address, hash, username, now );
      respond( res, 401 );
      return;
    }
  }
  catch ( error )
  {
    log( `Could not check the login of '${ loggableName( username ) }': ${ error.message }` );
    respond( res, 500 );
    return;
  }

  setBounded( acceptedLogins, hash, now + SUCCESS_TTL_MS );
  failures.delete( address );
  respond( res, 204 );
}

/**
 * Removes logins and failure records that have expired.
 *
 * @returns {void}
 */
function prune()
{
  const now = Date.now();

  for ( const [ hash, expires ] of acceptedLogins )
  {
    if ( expires <= now )
    {
      acceptedLogins.delete( hash );
    }
  }

  for ( const [ address, entry ] of failures )
  {
    if ( entry.lockedUntil <= now && now - entry.since > FAILURE_WINDOW_MS )
    {
      failures.delete( address );
    }
  }
}

setInterval( prune, PRUNE_INTERVAL_MS ).unref();

createServer( ( req, res ) =>
{
  handleRequest( req, res ).catch( ( error ) =>
  {
    log( `Login check failed: ${ error.message }` );
    respond( res, 500 );
  } );
} ).listen( PORT, '127.0.0.1' );
