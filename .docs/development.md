# Development

How the Dashy app is put together, and how to test a change before it reaches users.

## Repository layout

```text
repository.yaml              App repository definition, read by the Supervisor
dashy/
  config.yaml                App definition: version, port, options and schema
  Dockerfile                 Upstream Dashy image plus bash, jq, su-exec and nginx
  run.sh                     Reads the options, prepares /config, starts and supervises
                             Dashy, the login check and nginx
  nginx.conf                 The only listener: login, blocked paths, security headers
  ha-login.mjs               Login check: Home Assistant accounts, caching, lockout
  healthz.txt                The "ok" that nginx answers health checks with
  default-conf.yml           Starter dashboard, copied to /config on first start
  DOCS.md                    User documentation, shown on the Documentation tab
  README.md                  Short description, shown in the app store
  CHANGELOG.md               Release notes, shown when an update is available
  icon.png, logo.png         Artwork, resized from Dashy's own icon
  translations/              Option names and descriptions (en, nl)
.github/
  dependabot.yml             Weekly checks for a new Dashy image and new Actions
  workflows/ci.yml           Lint, build and start the app on every pull request
  workflows/dependabot-dashy.yml  Completes Dependabot's Dashy pull requests
.devcontainer/, .vscode/     Home Assistant development environment
.docs/                       Documentation for contributors
scripts/update-dashy.sh      Bumps the app to a new Dashy release
scripts/fake-supervisor.mjs  Stand-in for the Supervisor auth API, for local tests and CI
```

`.github/` is a real folder in this repository, not a link to the shared Copilot
instructions, because GitHub only reads Dependabot's configuration and the workflows there.

## How the app works

The image extends the official [`lissy93/dashy`](https://hub.docker.com/r/lissy93/dashy)
image, pinned to an exact release. That image is Alpine with Node.js; Dashy's Node server
(`server.js`) serves the prebuilt front end and a handful of server functions: saving the
configuration, status and ping checks, a CORS proxy, system information and the REST API.

Three processes run in the container:

```text
browser --> nginx :8080 --auth_request--> ha-login.mjs 127.0.0.1:8082 --> Supervisor /auth
              |
              +--> Dashy 127.0.0.1:8081
```

- **nginx** (master as `root`, worker as `nginx`) is the only process listening on the
  network. Before passing a request on, it asks the login check (`auth_request`). It answers
  `/healthz` without a login, for the watchdog and the health check: a plain `ok` from
  `healthz.txt` once Dashy's own `/healthz` answers within five seconds, so the version and
  uptime in Dashy's answer stay hidden. It passes `/api/` without a login, because Dashy
  checks its own API token there. It never serves
  `/config-backups/` or paths with a dot segment, removes the `Authorization` header before
  Dashy except on `/api/`, hides `X-Powered-By`, and adds `X-Content-Type-Options` and
  `Referrer-Policy`. Behind a proxy app on the Supervisor network (`172.30.32.0/23`) it takes
  the visitor's address from `X-Forwarded-For`.
- **ha-login.mjs** (as `node`) checks the browser's Basic credentials with the Supervisor
  auth API (`POST http://supervisor/auth`, enabled with `auth_api: true`), passing the
  credentials on and identifying itself with `X-Supervisor-Token`. It remembers a successful
  login for five minutes by the SHA-256 hash of the header, shares one Supervisor call
  between the requests a page sends at once, applies `allowed_users`, and locks an address
  out for 15 minutes after ten different wrong credentials within 15 minutes. It answers
  nginx with 204, 401 with a `WWW-Authenticate` challenge, or 403 when locked out.
- **Dashy** (as `node`) listens on `127.0.0.1:8081` only. It runs without the Supervisor
  token, and without any authentication of its own: nginx has already checked the login,
  and its `Authorization` header is removed, so Dashy's own users (`appConfig.auth.users`)
  only work in the browser.

The upstream image runs as the `node` user (uid 1000) with `tini` as its entrypoint. The app
image switches back to `root`, so `run.sh` can prepare the configuration folder and start
nginx, and keeps `tini` as PID 1. `config.yaml` sets `init: false`, because Docker's own init
would put a second init process in front of `tini`.

On start, `run.sh`:

1. Reads the options from `/data/options.json` with `jq`, and stops when `enable_api` is on
   without an `api_token`.
2. Copies `default-conf.yml` to `/config/conf.yml` when that file does not exist yet, and
   gives the `node` user ownership of everything in `/config`. Files copied in over Samba
   arrive owned by `root`, and Dashy must be able to overwrite them.
3. Writes `/run/dashy-app/login.conf`, which nginx includes: `auth_request /_login-check;`
   when `require_login` is on, and empty otherwise.
4. Exports the environment variables Dashy reads (see below), always including
   `USER_DATA_DIR=/config`.
5. Starts Dashy, the login check (only when `require_login` is on) and nginx in the
   background, and waits. On `SIGTERM` or `SIGINT` it stops all three. If one exits on its
   own, it stops the others and exits with an error, so the Supervisor watchdog restarts the
   app.

| Option                    | Setting                                       |
| ------------------------- | --------------------------------------------- |
| `require_login`           | `login.conf` for nginx, see above             |
| `allowed_users`           | `ALLOWED_USERS` for the login check, as JSON  |
| `enable_api`              | `ENABLE_API=true`, only when on               |
| `api_token`               | `API_TOKEN`                                   |
| `disable_proxy_endpoints` | `DISABLE_PROXY_ENDPOINTS=true`, only when on  |
| `config_backups`          | `DISABLE_CONFIG_BACKUPS=true`, only when off  |

Dashy tests some of its variables for being non-empty, so `false` would turn them on;
`run.sh` leaves them unset instead of setting them to `false`.

The Dockerfile replaces the upstream health check, which runs every five minutes: the
Supervisor shows the app as *starting* until the first check passes. The new one runs every
30 seconds, with the same `services/healthcheck.js`, which requests `/healthz` on port 8080,
so through nginx. The Supervisor watchdog requests the same `/healthz` from outside.

### Storage

| Path in the container    | Contents                                      | In backups |
| ------------------------ | --------------------------------------------- | ---------- |
| `/config/conf.yml`       | The dashboard configuration                   | Yes        |
| `/config/*.yml`          | Additional pages                              | Yes        |
| `/config/config-backups` | Copies of `conf.yml`, made before each save   | Yes        |
| `/config/...`            | The user's own images and other files         | Yes        |
| `/data/options.json`     | App options, written by the Supervisor        | Yes        |

`/config` is the app configuration folder (`map: app_config:rw`), which users can reach
through the `app_configs` Samba share. Dashy serves every file in its user data folder as a
static file, so everyone who may log in can read them; `DOCS.md` warns users not to keep
anything private there. Nothing else is written at run
time, so `backup: hot` gives a consistent backup without stopping Dashy.

### Design decisions

**Configuration folder as user data.** Dashy reads `conf.yml`, additional pages and the
user's own icons from one folder. Pointing `USER_DATA_DIR` at the app configuration folder
makes all of it reachable over Samba and Studio Code Server, and keeps Dashy's own editor
saving to the same file.

**No ingress.** Home Assistant's ingress serves an app under a per-session sub-path
(`/api/hassio_ingress/<token>/`). Dashy's front end is built by Vite with base `/`, so its
scripts, styles and configuration are requested from the web root and break under that
prefix; changing the base means rebuilding the front end. The app publishes the port and
sets `webui` instead, which gives the **Open web UI** button. Dashy sends no
`X-Frame-Options` header, so a Webpage dashboard can frame it; `DOCS.md` explains how.

**Host port 4000.** Dashy listens on 8080 inside the container, as upstream. Port 8080 on the
host is a common choice of other apps, so the app publishes it on 4000, the port Dashy uses
outside Docker.

**Login in front of Dashy, not Dashy's own.** Dashy's built-in login runs in the browser,
and its server-side checks cover the configuration and server functions but not the page or
the other files in its user data folder. nginx checks every request instead, so nothing is
reachable without a login, and Home Assistant accounts mean there is no second password to
manage. The Supervisor auth API checks passwords only, without Home Assistant's two-factor
step; `DOCS.md` says so. A Basic login was chosen over a login page with a session cookie:
it needs no session handling and no CSRF protection, and works inside the Webpage dashboard
without third-party cookies.

**No HTTPS in the app.** Dashy can serve HTTPS itself, but then redirects plain HTTP and its
health check follows fixed certificate paths. A reverse proxy app is the usual way to add
HTTPS in Home Assistant, and keeps the app simple.

**Locally built image.** The Supervisor builds the Dockerfile on the user's device; there is
no `image` key in `config.yaml`. The build only adds four Alpine packages, so it is quick.

**Upstream versioned tags.** `lissy93/dashy:<version>` is published for `amd64` and `arm64`,
which map to the Supervisor's `amd64` and `aarch64`.

## Testing a change

Work through these in order. Each catches problems the previous one cannot.

### 1. Lint

```bash
docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable /mnt/dashy/run.sh /mnt/scripts/update-dashy.sh
docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:latest
node --check dashy/ha-login.mjs
```

In Git Bash on Windows, put `MSYS_NO_PATHCONV=1` in front of `docker run` so the paths are not
rewritten. GitHub runs the same checks in the CI workflow.

### 2. Build and run with Docker

This checks the image, `run.sh`, nginx and the login without Home Assistant. It needs Docker
Desktop or any Docker Engine. `scripts/fake-supervisor.mjs` stands in for the Supervisor
auth API: it accepts `admin` / `secret123`.

```bash
docker build -t local/dashy-app dashy

mkdir -p test/data test/config
cat > test/data/options.json <<'JSON'
{
  "require_login": true,
  "allowed_users": [],
  "enable_api": false,
  "disable_proxy_endpoints": false,
  "config_backups": true
}
JSON

docker network create dashy-test
docker run -d --rm --name fake-supervisor --network dashy-test --network-alias supervisor \
  -v "$PWD/scripts:/scripts" --entrypoint node local/dashy-app /scripts/fake-supervisor.mjs

docker run --rm --name dashy-test --network dashy-test -p 4000:8080 \
  -e TZ=Europe/Amsterdam -e SUPERVISOR_TOKEN=test-token \
  -v "$PWD/test/data:/data" -v "$PWD/test/config:/config" local/dashy-app
```

Open <http://localhost:4000> and log in as `admin` / `secret123`. The first start creates
`test/config/conf.yml`. Stop with `docker stop dashy-test fake-supervisor`, then
`docker network rm dashy-test`. The `test/` folder is ignored by Git.

To check the `aarch64` build on an `amd64` machine (slow, uses emulation):

```bash
docker buildx build --platform linux/arm64 -t local/dashy-app:arm64 dashy
```

Things worth checking after a change to `run.sh`, `nginx.conf` or `ha-login.mjs`:

- A fresh start creates `conf.yml`; a second start leaves it alone.
- `/` and `/conf.yml` return 401 without a login and 200 with `admin` / `secret123`;
  `/healthz` returns 200 without one.
- `/config-backups/...` and `/.anything` return 404, also with a login.
- Five requests at once with the same new login cause one check in the fake Supervisor's
  log, and later requests none for five minutes.
- Ten different wrong passwords lock the address out: the next request, even with the right
  password, returns 403.
- With `allowed_users` set, a user outside the list gets 401.
- With `enable_api` on and no `api_token`, the app stops with a message; with a token,
  `/api/config` returns 401 without it and 200 with `Authorization: Bearer <token>`.
- With `require_login` off, everything opens without a login and the log warns about it.
- Saving in Dashy's editor writes `conf.yml` and a file in `config-backups`, and no copy
  when `config_backups` is off.
- `docker exec dashy-test ps -o user,args` shows `node server.js` and `ha-login.mjs`
  running as `node`, and the nginx worker as `nginx`.
- `docker exec dashy-test pkill -f server.js` stops the whole app with exit code 1.
- `docker inspect -f '{{.State.Health.Status}}' dashy-test` turns `healthy` within a
  minute.

### 3. Run in a development Home Assistant

The repository includes the official Home Assistant development container, which runs a
complete Home Assistant with a Supervisor inside Docker. This tests the parts plain Docker
cannot: `config.yaml`, the options form, translations, the **Open web UI** button and the
watchdog.

1. Install the VS Code *Dev Containers* extension and start Docker Desktop.
2. Open the repository in VS Code and select **Reopen in Container**.
3. Run the task **Start Home Assistant** (**Terminal** > **Run Task**).
4. Open <http://localhost:7123>, complete onboarding, and go to **Settings** > **Apps** >
   **Install app**. Dashy is listed under **Local apps**.

Port 4000 is forwarded from the development container, so **Open web UI** works from the
same computer.

### 4. Install on a real Home Assistant

1. Install the **Samba share** or **Advanced SSH & Web Terminal** app.
2. Copy the `dashy/` folder into the `local_apps` share (the `/addons` folder over SSH).
3. Go to **Settings** > **Apps** > **Install app**, open the three-dots menu and select
   **Check for updates**. Dashy appears under **Local apps**.
4. Install, configure and start it as described in `DOCS.md`.

A local copy is a separate app from the one installed from GitHub, with its own
configuration folder, so both can be installed side by side as long as their ports differ.
After changing files, rebuild from the app's three-dots menu (**Rebuild**).
