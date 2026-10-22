# Releasing

The app version always equals the Dashy version it contains, so users see the Dashy version
in Home Assistant.

## Updating to a new Dashy release

This repository does not contain Dashy's source code. The app is built from the official
Dashy Docker image, so updating Dashy means pointing the app at a newer image tag.

### With Dependabot

Dependabot checks Docker Hub every week (`.github/dependabot.yml`). For a new Dashy image it
opens a pull request that changes the `FROM` line of `dashy/Dockerfile`. Two workflows then
run on it:

- **CI** builds the new image, starts it and checks the login and the blocked paths.
- **Complete Dashy update** runs `scripts/update-dashy.sh --no-build` and pushes the version
  bump in `config.yaml`, the README badge and a changelog entry to the pull request.

Then do steps 2 and 5 below: read the release notes and test the update on existing
configuration. Rewrite the changelog entry if the release changes something users notice.
Merge, then tag the merge commit with the version (`git tag 4.9.0`) and push the tag.

Dependabot also opens pull requests for new versions of the GitHub Actions in the workflows,
once a month. They need no version bump of the app.

### With the update script

From the repository root, in Git Bash or any other Bash shell, with Docker running:

```bash
scripts/update-dashy.sh          # latest Dashy release on Docker Hub
scripts/update-dashy.sh 4.9.0    # a specific release
```

The script checks that the image exists for both architectures, refuses downgrades, updates
the version in all files, adds a changelog entry and builds the image. It does not commit
anything. Then do steps 2, 5 and 6 below: read the release notes, test the update, and
commit, tag and push.

Dashy publishes patch releases as Docker tags and Git tags, but not always as GitHub
releases, so the script takes the newest version from Docker Hub.

### By hand

1. Check the new release on [Docker Hub](https://hub.docker.com/r/lissy93/dashy/tags), for
   example `4.9.0`, and confirm it lists both `linux/amd64` and `linux/arm64`:

   ```bash
   docker buildx imagetools inspect lissy93/dashy:4.9.0
   ```

2. Read the [Dashy release notes](https://github.com/Lissy93/dashy/releases) and the
   commits since the previous tag for changes to the Docker image, especially its `USER`,
   `ENTRYPOINT`, base image, `services/healthcheck.js`, and the environment variables that
   `run.sh` sets.
3. Update the version in three places:
   - the `FROM` line in `dashy/Dockerfile`
   - `version` in `dashy/config.yaml`
   - the Dashy badge in `README.md`
4. Add an entry at the top of `dashy/CHANGELOG.md` that links to the Dashy release notes.
5. Test as described in [Development](development.md). Always start the new version on the
   `test/config` folder of the previous one, not only on an empty folder, and check that
   the log reports `Config file is valid`.
6. Commit, tag the commit with the version (`git tag 4.9.0`), and push both. Home Assistant
   offers the update to users the next time it checks the repository.

## App-only changes

For a change to the app itself without a new Dashy release, add a fourth version segment:
`4.8.7` becomes `4.8.7.1`, then `4.8.7.2`. The next Dashy release resets it.

## Changes to watch for

- **A different user or entrypoint.** `run.sh` assumes the `node` user, `tini` at
  `/sbin/tini` as the entrypoint, and Alpine's `apk`, with an `nginx` package that has the
  `auth_request` and `realip` modules.
- **New server routes.** nginx sends everything through the login except `/healthz` and
  `/api/`. A new Dashy route that browsers must reach without a login needs its own
  `location` in `nginx.conf`.
- **Renamed environment variables.** Check `.env` and `services/app.js` upstream for
  `USER_DATA_DIR`, `PORT`, `HOST`, `ENABLE_API`, `API_TOKEN`, `DISABLE_PROXY_ENDPOINTS` and
  `DISABLE_CONFIG_BACKUPS`.
- **Configuration changes.** Options in `conf.yml` that are renamed or removed break the
  starter `default-conf.yml` too; the startup log validates it on a fresh `test/config`.
- **Supervisor changes.** Check the
  [app configuration reference](https://developers.home-assistant.io/docs/apps/configuration)
  for deprecations, and watch the Supervisor log for warnings about this app.
