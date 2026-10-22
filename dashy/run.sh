#!/usr/bin/env bash
# Starts the Dashy app: reads the app options, prepares the configuration
# folder, then starts Dashy and the login check as the unprivileged node user,
# and nginx in front of them. On SIGTERM or SIGINT all three are stopped; if one
# of them exits on its own, the others are stopped too and the app exits with an
# error, so the watchdog can restart it.

set -euo pipefail

readonly OPTIONS_FILE=/data/options.json
readonly APP_CONFIG_DIR=/config
readonly APP_FILES_DIR=/opt/dashy-app
readonly DASHY_DIR=/app
readonly DASHY_USER=node
readonly DASHY_PORT=8081
readonly LOGIN_CHECK_PORT=8082
readonly DEFAULT_CONFIG="$APP_FILES_DIR/default-conf.yml"
readonly LOGIN_CHECK_SCRIPT="$APP_FILES_DIR/ha-login.mjs"
readonly LOGIN_CONF=/run/dashy-app/login.conf
readonly MAIN_CONFIG_NAME=conf.yml

PIDS=()

log()
{
  echo "[dashy-app] $*"
}

fatal()
{
  log "ERROR: $*" >&2
  exit 1
}

# Prints one option from the app configuration, or nothing when it is unset.
option()
{
  jq -r --arg key "$1" '.[$key] // empty' "$OPTIONS_FILE"
}

# Prints "true" when a boolean option is on, and "false" otherwise.
flag()
{
  jq -r --arg key "$1" 'if .[$key] == true then "true" else "false" end' "$OPTIONS_FILE"
}

read_options()
{
  if [ ! -f "$OPTIONS_FILE" ]
  then
    fatal "$OPTIONS_FILE not found. This image must run as a Home Assistant app."
  fi

  REQUIRE_LOGIN=$(flag require_login)
  ALLOWED_USERS=$(jq -c '[ .allowed_users // [] | .[] | strings | ascii_downcase | select( length > 0 ) ]' "$OPTIONS_FILE")
  ENABLE_API=$(flag enable_api)
  API_TOKEN=$(option api_token)
  DISABLE_PROXY_ENDPOINTS=$(flag disable_proxy_endpoints)
  CONFIG_BACKUPS=$(flag config_backups)

  # The REST API bypasses the login, so it needs a token of its own.
  if [ "$ENABLE_API" = "true" ] && [ -z "$API_TOKEN" ]
  then
    fatal "enable_api is on, but api_token is empty. Set a long random api_token, or turn enable_api off."
  fi
}

# Uses the app configuration folder as Dashy's user data folder, and gives it a
# starter conf.yml on first start. Everything in the folder must be writable by
# Dashy, also files copied in over Samba, which arrive owned by root.
prepare_config()
{
  mkdir -p "$APP_CONFIG_DIR"

  if [ ! -f "$APP_CONFIG_DIR/$MAIN_CONFIG_NAME" ]
  then
    cp "$DEFAULT_CONFIG" "$APP_CONFIG_DIR/$MAIN_CONFIG_NAME"
    log "First start: created $MAIN_CONFIG_NAME in the app configuration folder."
  fi

  chown -R "$DASHY_USER:$DASHY_USER" "$APP_CONFIG_DIR"
}

# Writes the part of the nginx configuration that turns the login on or off.
prepare_login()
{
  mkdir -p "$(dirname "$LOGIN_CONF")" /run/nginx

  if [ "$REQUIRE_LOGIN" != "true" ]
  then
    : > "$LOGIN_CONF"
    log "WARNING: require_login is off, so everyone who can reach Dashy can see and change the dashboard."
    return
  fi

  echo "auth_request /_login-check;" > "$LOGIN_CONF"

  if [ "$ALLOWED_USERS" = "[]" ]
  then
    log "Login with a Home Assistant account is required."
  else
    log "Login with a Home Assistant account is required; allowed users: $(jq -r 'join( ", " )' <<< "$ALLOWED_USERS")."
  fi
}

# Translates the app options into the environment variables Dashy reads. Dashy
# treats any non-empty value as on, so flags are only set when they are on.
export_settings()
{
  export USER_DATA_DIR="$APP_CONFIG_DIR"

  if [ "$ENABLE_API" = "true" ]
  then
    export ENABLE_API=true API_TOKEN
    log "The REST API is on."
  fi

  if [ "$DISABLE_PROXY_ENDPOINTS" = "true" ]
  then
    export DISABLE_PROXY_ENDPOINTS=true
    log "Status checks, ping checks and the CORS proxy are turned off."
  fi

  if [ "$CONFIG_BACKUPS" != "true" ]
  then
    export DISABLE_CONFIG_BACKUPS=true
  fi
}

# Starts Dashy on the loopback address, where only nginx can reach it. Dashy
# never needs the Supervisor token, so it does not get it.
start_dashy()
{
  log "Starting Dashy."
  (
    cd "$DASHY_DIR"
    exec env -u SUPERVISOR_TOKEN PORT="$DASHY_PORT" HOST=127.0.0.1 \
      su-exec "$DASHY_USER:$DASHY_USER" node server.js
  ) &
  PIDS+=( $! )
}

start_login_check()
{
  if [ "$REQUIRE_LOGIN" != "true" ]
  then
    return
  fi

  if [ -z "${SUPERVISOR_TOKEN:-}" ]
  then
    log "WARNING: no Supervisor token; logins cannot be checked, so every login will fail."
  fi

  env LOGIN_CHECK_PORT="$LOGIN_CHECK_PORT" ALLOWED_USERS="$ALLOWED_USERS" \
    su-exec "$DASHY_USER:$DASHY_USER" node "$LOGIN_CHECK_SCRIPT" &
  PIDS+=( $! )
}

start_nginx()
{
  nginx &
  PIDS+=( $! )
}

stop_all()
{
  local pid

  for pid in "${PIDS[@]}"
  do
    kill -TERM "$pid" 2> /dev/null || true
  done

  for pid in "${PIDS[@]}"
  do
    wait "$pid" 2> /dev/null || true
  done
}

# shellcheck disable=SC2317,SC2329 # Invoked through the trap set in main.
shutdown()
{
  # Ignore repeated stop signals so the shutdown runs only once.
  trap '' TERM INT
  log "Shutting down."
  stop_all
  exit 0
}

# Waits until one of the processes exits, then stops the others.
supervise()
{
  wait -n "${PIDS[@]}" || true
  log "A process of the app stopped unexpectedly; stopping the app."
  stop_all
  exit 1
}

main()
{
  read_options
  prepare_config
  prepare_login
  export_settings
  trap shutdown TERM INT
  start_dashy
  start_login_check
  start_nginx
  supervise
}

main "$@"
