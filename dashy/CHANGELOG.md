# Changelog

All notable changes to this app are documented here. The version number is the Dashy
version the app contains; see the
[Dashy releases](https://github.com/Lissy93/dashy/releases) for changes in Dashy itself.

## 4.8.7

First release.

- Dashy 4.8.7, built from the official `lissy93/dashy` image.
- Login with your Home Assistant account in front of every page and file, optionally
  limited to a list of users, with a 15-minute lockout after repeated wrong passwords.
- The dashboard configuration (`conf.yml`) lives in the app configuration folder, with a
  starter dashboard on first start, and is included in Home Assistant backups.
- Configuration backups and hidden files are never served; Dashy itself only listens inside
  the app and runs as an unprivileged user.
- Optional REST API with its own token.
- Opens through **Open web UI**; English and Dutch option descriptions.
