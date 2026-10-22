# Dashy for Home Assistant

[![Add repository to Home Assistant][repository-badge]][repository-url]
![Dashy 4.8.7][dashy-shield]
![Supports aarch64 Architecture][aarch64-shield]
![Supports amd64 Architecture][amd64-shield]
[![License: MIT][license-shield]](LICENSE)

Run [Dashy](https://dashy.to/), the self-hosted start page for your home lab, as a Home
Assistant app.

## Features

- Dashy, built from the official image, with nothing else to set up.
- Login with your Home Assistant account in front of every page, optionally limited to
  some users, with a lockout after repeated wrong passwords.
- A starter dashboard on first start, editable in the browser or as `conf.yml` in the app
  configuration folder.
- Dashy's REST API, with its own token, from the app options.
- The dashboard configuration is included in Home Assistant backups.
- Opens from the app page, the Home Assistant Companion app, or a sidebar dashboard.
- Runs on `amd64` and `aarch64` (Raspberry Pi 4 and 5).

## Installation

Select the button above, or add the repository by hand:

1. In Home Assistant, go to **Settings** > **Apps** > **Install app**.
2. Open the three-dots menu in the top-right corner and select **Repositories**.
3. Add `https://github.com/FaliseDotCom/ha-dashy` and select **Add**.
4. Find **Dashy** in the app store and select **Install**.

Then follow the [app documentation](dashy/DOCS.md) to open Dashy and build your dashboard.
The same documentation is shown on the app's **Documentation** tab in Home Assistant.

## Apps in this repository

| App               | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| [Dashy](dashy/)   | A self-hosted start page for your home lab.                |

## Contributing

Bug reports and pull requests are welcome. [Development](.docs/development.md) explains how
the app works and how to test changes, and [Releasing](.docs/releasing.md) covers updating
to a new Dashy version.

The app is a shell script, an nginx configuration, a small Node.js login check, YAML and a
Dockerfile. Pull requests should follow these conventions:

- **Formatting:** two spaces per indentation level, opening braces on their own line, and
  spaces inside parentheses and brackets, as in the existing files. `.editorconfig` sets the
  basics for most editors.
- **Documentation:** every JavaScript function and constant has a JSDoc comment.
- **Checks:** shell scripts pass [ShellCheck](https://www.shellcheck.net/), and the
  workflows pass [actionlint](https://github.com/rhysd/actionlint).
  [Development](.docs/development.md#1-lint) shows how to run both with Docker. GitHub runs
  the same checks, plus a build and start of the app, on every pull request.
- **User-facing changes:** update [`dashy/DOCS.md`](dashy/DOCS.md) and add an entry to
  [`dashy/CHANGELOG.md`](dashy/CHANGELOG.md).

## AI coding guidelines

AI coding assistants working on this repository should apply the `javascript` skill to
`dashy/ha-login.mjs`. The shell scripts, nginx configuration and YAML follow the global
formatting rules: two-space indentation, braces on their own line, and the shell style of
`dashy/run.sh` (`then` and `do` on their own line).

This repository has a real `.github/` folder, with Dependabot's configuration and the
workflows, instead of a link to the shared Copilot instructions; GitHub only reads them
there. Do not replace it with that link.

## License

The files in this repository are released under the [MIT License](LICENSE). Dashy itself is
also [MIT licensed](https://github.com/Lissy93/dashy/blob/master/LICENSE), and is not
affiliated with this project.

The icon images (`dashy/icon.png` and `dashy/logo.png`) are resized from Dashy's own icon
and belong to the Dashy project.

[repository-badge]: https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg
[repository-url]: https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FFaliseDotCom%2Fha-dashy
[dashy-shield]: https://img.shields.io/badge/Dashy-4.8.7-blue.svg
[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
[license-shield]: https://img.shields.io/badge/license-MIT-green.svg
