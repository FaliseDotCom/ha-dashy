# Dashy

[Dashy](https://dashy.to/) is a free, open-source start page for your home lab. It puts your
services, bookmarks and widgets on one page, shows which services are up, and comes with
search, keyboard shortcuts and dozens of themes. This app runs Dashy on your Home Assistant
server, behind a login with your Home Assistant account.

## Requirements

- Home Assistant OS or a Supervised installation, version 2026.7 or later.
- A 64-bit system: `amd64` (most PCs and NUCs) or `aarch64` (Raspberry Pi 4 or 5, and
  most other ARM boards).
- Around 300 MB of free disk space for the app.
- Around 150 MB of free memory while Dashy is running.

## Installation

1. Add this repository to Home Assistant. Go to **Settings** > **Apps** > **Install app**,
   open the three-dots menu in the top-right corner, select **Repositories**, then add:

   ```text
   https://github.com/FaliseDotCom/ha-dashy
   ```

2. Find **Dashy** in the app store and select **Install**.
3. Turn on **Watchdog** on the **Info** tab, and select **Start**.
4. Select **Open web UI** and [log in](#logging-in) with your Home Assistant user name and
   password. You see a starter dashboard with a link to Home Assistant and to Dashy's
   documentation.

No options are needed to get started.

## Logging in

Dashy asks for a login before it shows anything. Use the user name and password of your
Home Assistant account: the user name you log in to Home Assistant with, not your display
name. The app checks them with Home Assistant, so a changed password works in Dashy straight
away, and the app never stores your password.

The login appears in the browser's own login window, not on a page of Dashy. The browser
remembers it until you close the browser; there is no **Log out** button.

- **Who may log in.** Every Home Assistant user, or only those listed in
  [`allowed_users`](#option-allowed_users). Everyone who logs in may also change the
  dashboard.
- **Two-factor authentication** is not asked for: Home Assistant only checks the password
  for apps. Keep strong passwords, limit [`allowed_users`](#option-allowed_users), and read
  [Remote access](#remote-access) before making Dashy reachable from the internet.
- **Wrong passwords.** After ten different wrong passwords from one address within 15
  minutes, that address is locked out for 15 minutes. Failed logins and lockouts are listed
  in the app's **Log** tab.
- **No login on your home network?** Turn off [`require_login`](#option-require_login) to
  let everyone who can reach Dashy in without one.

## Opening Dashy

Dashy runs on its own port, **4000**, separate from the Home Assistant interface.

### From the app page

Select **Open web UI** on the app's **Info** tab. This opens
`http://<your-home-assistant-address>:4000` in a new tab. It works on any device on your
home network, including the Home Assistant Companion app on Android and iOS.

To make Dashy your browser's start page, set that address as the home page or new tab page
in your browser's settings.

### In the Home Assistant sidebar (optional)

This app does not use Home Assistant's built-in sidebar integration (called *ingress*),
because Dashy cannot run under the changing sub-path that ingress uses. You can still add
Dashy to the sidebar with a **Webpage** dashboard:

1. Go to **Settings** > **Dashboards** and select **Add dashboard**.
2. Choose **Webpage** and enter Dashy's address, for example
   `http://homeassistant.local:4000`.
3. Give it a title such as *Dashy*, pick an icon such as `mdi:view-dashboard-outline`, and
   keep **Show in sidebar** turned on.

Three things to keep in mind:

- The browser loads Dashy directly, so the sidebar entry only works where Dashy's address
  is reachable, normally on your home network.
- If you open Home Assistant over `https://`, the address of the dashboard must use
  `https://` too, or the browser blocks the page. Use your [remote access](#remote-access)
  address in that case.
- The browser asks for the Dashy login inside the sidebar page the first time.

## Building your dashboard

Everything on the dashboard, its sections, items, widgets and theme, is set in one file,
`conf.yml`. On its first start the app creates a starter `conf.yml`; change it in either of
two ways.

**In Dashy.** The buttons at the top right of the dashboard open Dashy's settings. **Edit
mode** lets you add, change and move sections and items on the page itself; the
configuration editor shows the whole `conf.yml` to edit as text. Both save straight to
`conf.yml`.

**As a file.** `conf.yml` is in the app's configuration folder, which you can reach with the
**Samba share** or **Studio Code Server** app. It is the `app_configs` share, in the folder
whose name ends in `_dashy`. Dashy reads the file every time the page loads, so reload the
page after saving; there is no need to restart the app. Editors that understand the
`yaml-language-server` line at the top of the file, such as Studio Code Server with its YAML
extension, check the file and suggest options as you type.

A short example:

```yaml
pageInfo:
  title: Home
appConfig:
  theme: colorful
sections:
  - name: Media
    icon: fas fa-film
    items:
      - title: Jellyfin
        url: http://192.168.1.20:8096
        icon: hl-jellyfin
        statusCheck: true
```

Dashy's documentation covers every option:

- [Configuring](https://dashy.to/docs/configuring): all options of `conf.yml`.
- [Widgets](https://dashy.to/docs/widgets): clocks, weather, system information, RSS
  feeds and many more.
- [Icons](https://dashy.to/docs/icons): Font Awesome icons (`fas fa-...`), home lab icons
  (`hl-...`), a site's favicon (`favicon`), or your own images.
- [Status indicators](https://dashy.to/docs/status-indicators): the dot that shows whether a
  service is up.
- [Multiple pages](https://dashy.to/docs/pages-and-sections): extra `.yml` files for more
  pages.

An error in `conf.yml` shows on the dashboard and in the app's **Log** tab when the app
starts. Fix the file, or restore a [backup](#configuration-backups).

Dashy's own [login and user options](https://dashy.to/docs/authentication)
(`appConfig.auth`) are not needed: the app's [login](#logging-in) already protects the
dashboard. Dashy's users still work, for example to show each person different sections,
but they are checked in the browser only, so do not rely on them to keep anyone out.

### Your own images and files

Every file in the configuration folder can be opened through Dashy, so an image saved there
as `icons/nas.png` can be used as `icon: /icons/nas.png`. Additional pages are `.yml` files
in the same folder.

Everyone who may log in can open these files, and everyone on your network when
[`require_login`](#option-require_login) is off, so keep nothing else in the folder that
should stay private. The `config-backups` folder and files whose name starts with a dot are
never served.

### Configuration backups

Each time you save from inside Dashy, the previous `conf.yml` is copied into the
`config-backups` folder first, named with the time it was saved. To go back, copy a backup
over `conf.yml`. Turn this off with [`config_backups`](#option-config_backups); old backups
are never removed automatically.

## Configuration

Example configuration:

```yaml
require_login: true
allowed_users:
  - alice
  - bob
enable_api: false
disable_proxy_endpoints: false
config_backups: true
```

Restart the app after changing any option.

### Option: `require_login`

Asks for a Home Assistant login before Dashy shows anything; see [Logging in](#logging-in).
On by default. Turn it off only when everyone who can reach port 4000 may see and change the
dashboard; the app then warns about that in the log on every start.

### Option: `allowed_users`

The Home Assistant user names that may log in, one per line. Leave the list empty to let
every Home Assistant user in. Upper and lower case do not matter.

### Option: `enable_api`

Turns on Dashy's [REST API](https://dashy.to/docs/api), for reading and changing the
dashboard from scripts or other programs. The API does not use the Home Assistant login, so
it needs an [`api_token`](#option-api_token); the app does not start with the API on and no
token set.

```bash
curl -H 'Authorization: Bearer <api_token>' http://homeassistant.local:4000/api/config
```

### Option: `api_token`

A long, random secret that scripts send as a bearer token to use the REST API, for example
the output of `openssl rand -hex 32`. It gives full access to the dashboard's configuration,
so treat it like a password.

### Option: `disable_proxy_endpoints`

Status checks, ping checks and some widgets do not run in your browser, but ask Dashy's
server to contact the address for them. Turn this option on to stop the server from making
those requests; those features then stop working. Consider it when Dashy is reachable from
the internet.

### Option: `config_backups`

Keeps a copy of `conf.yml` in the `config-backups` folder before every change made inside
Dashy. On by default. See [Configuration backups](#configuration-backups).

### Port

The **Network** section of the **Configuration** tab sets the port Dashy is published on.
Change it if port 4000 is already in use on your server. Clear it to stop publishing Dashy
on your network entirely, for example when a proxy app is the only way in.

## Remote access

To use Dashy away from home, put it behind a reverse proxy that provides HTTPS, such as the
**Cloudflared** or **NGINX Proxy Manager** app, and point the proxy at:

```text
http://<your-home-assistant-ip>:4000
```

Keep [`require_login`](#option-require_login) on, and since the login has no two-factor
step, limit [`allowed_users`](#option-allowed_users) to the people who need Dashy away from
home. Consider [`disable_proxy_endpoints`](#option-disable_proxy_endpoints) too. Never expose
port 4000 directly to the internet without HTTPS: the login would travel unencrypted.

Proxy apps in Home Assistant pass on the visitor's address, so a lockout after wrong
passwords only affects that visitor. A proxy elsewhere on your network makes every visitor
appear as the proxy, and a lockout then affects everyone who comes in through it.

## Backups

The app is included in Home Assistant backups. A backup contains the whole configuration
folder: `conf.yml`, additional pages, your own images and the configuration backups, plus
the app options. Dashy keeps running while the backup is made.

Uninstalling the app **deletes the configuration folder** with your dashboard. Create a
backup first, or copy `conf.yml` somewhere safe.

## Updates

The app's version number is the Dashy version it contains. Read the
[Dashy release notes](https://github.com/Lissy93/dashy/releases) for the versions you are
skipping: options in `conf.yml` are occasionally renamed or removed.

## Troubleshooting

Start with the **Log** tab of the app. Messages from the app itself start with
`[dashy-app]`; when Dashy starts, it also checks `conf.yml` and lists any problems.

**The browser keeps asking for a user name and password**
: Use your Home Assistant user name, which is not always your display name: find it under
  **Settings** > **People** > **Users** (with advanced mode on in your profile). Check that
  it is in [`allowed_users`](#option-allowed_users) when that list is not empty. The log
  shows each failed login.

**"Too many failed logins from your address"**
: Wait 15 minutes, or restart the app to clear all lockouts at once.

**"Could not check the login" in the log**
: The app could not reach Home Assistant to check the password, for example while Home
  Assistant restarts. Try again in a minute.

**The dashboard shows an error about the configuration**
: `conf.yml` contains a mistake, often wrong indentation. The log names the line. Fix it,
  or copy a file from `config-backups` over it.

**Changes made in the file do not show up**
: Reload the page. If that does not help, reload with Ctrl+Shift+R: Dashy works offline too,
  and may show the copy it kept in the browser. Changes made in Dashy but saved only in the
  browser also take precedence until you reset Dashy's local settings in its settings menu.

**A status check shows a service as down although it works**
: The check runs from inside the app, not from your browser. An address such as
  `localhost` or a name only your computer knows does not work there; use the service's IP
  address. For services with a self-signed certificate, add `statusCheckAllowInsecure: true`
  to the item.

**The app stops right after starting**
: Read the last `[dashy-app]` line in the log. Check also that port 4000 is not used by
  another app, or pick a different port in the **Network** section.

## Security

What the app does to protect your dashboard:

- Every page and file needs a Home Assistant login, checked by the app before a request
  reaches Dashy. Only Dashy's health check, used by the watchdog, is open.
- Repeated wrong passwords lock the address out for 15 minutes.
- The configuration backups and hidden files are never served.
- Dashy itself is only reachable from inside the app, runs as an unprivileged user, and does
  not get the app's Supervisor token.
- The REST API is off, and cannot be turned on without its own token.
- Pages carry headers that stop browsers from guessing file types and limit what other sites
  learn about the address you came from.

What remains up to you:

- Keep [`require_login`](#option-require_login) on unless every device on your network may
  change the dashboard.
- Use strong Home Assistant passwords; the login asks for no two-factor code.
- Only reach Dashy over HTTPS from the internet; see [Remote access](#remote-access).
- Keep nothing private in the configuration folder.

## Support

- Problems with this app: [open an issue](https://github.com/FaliseDotCom/ha-dashy/issues).
- Questions about using Dashy: [Dashy documentation](https://dashy.to/docs) and
  [Dashy discussions](https://github.com/Lissy93/dashy/discussions).
