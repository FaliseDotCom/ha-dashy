#!/usr/bin/env bash
# Updates the app to a new Dashy release: checks the upstream image, bumps the
# version everywhere it appears, adds a changelog entry and builds the image.
# It never commits or pushes; it prints the git commands to run afterwards.
#
# Usage: scripts/update-dashy.sh [--no-build] [version]
#   --no-build  Skip building the image, for CI that builds it separately.
#   version     Dashy version such as 4.9.0. Defaults to the newest tag on Docker Hub.
#
# The current version is read from config.yaml, not from the Dockerfile, so the
# script also completes a Dependabot pull request that only changed the FROM line.

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
readonly REPO_ROOT
readonly DOCKERFILE="$REPO_ROOT/dashy/Dockerfile"
readonly CONFIG="$REPO_ROOT/dashy/config.yaml"
readonly CHANGELOG="$REPO_ROOT/dashy/CHANGELOG.md"
readonly README="$REPO_ROOT/README.md"
readonly IMAGE=lissy93/dashy
readonly TAGS_API="https://hub.docker.com/v2/repositories/$IMAGE/tags?page_size=100&ordering=last_updated"
readonly RELEASES_URL=https://github.com/Lissy93/dashy/releases
readonly VERSION_PATTERN='^[0-9]+\.[0-9]+\.[0-9]+$'

fatal()
{
  echo "ERROR: $*" >&2
  exit 1
}

# Dashy does not publish every patch version as a GitHub release, but every one
# gets a Docker tag.
latest_release()
{
  curl -fsSL "$TAGS_API" \
    | grep -oE '"name": *"[0-9]+\.[0-9]+\.[0-9]+"' \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' \
    | sort -V | tail -n 1
}

# Prints the Dashy version of the app, without an app-only fourth segment.
current_version()
{
  sed -n 's|^version: "\([0-9]*\.[0-9]*\.[0-9]*\).*"$|\1|p' "$CONFIG"
}

# The Supervisor architectures amd64 and aarch64 need linux/amd64 and linux/arm64.
check_image()
{
  local manifest
  manifest=$(docker buildx imagetools inspect "$IMAGE:$1") || fatal "Image $IMAGE:$1 not found on Docker Hub."

  local platform
  for platform in linux/amd64 linux/arm64
  do
    if ! grep -q "Platform: *$platform\$" <<< "$manifest"
    then
      fatal "Image $IMAGE:$1 has no $platform build."
    fi
  done
}

update_files()
{
  local old="$1"
  local new="$2"

  sed -i "s|^FROM $IMAGE:.*\$|FROM $IMAGE:$new|" "$DOCKERFILE"
  sed -i "s|^version: \".*\"\$|version: \"$new\"|" "$CONFIG"
  sed -i "s|Dashy $old|Dashy $new|; s|Dashy-$old-|Dashy-$new-|" "$README"
}

# Inserts the new entry above the first existing release heading.
add_changelog_entry()
{
  local new="$1"
  local entry="## $new\n\n- Dashy $new. See the [Dashy releases]($RELEASES_URL) for what changed.\n"

  awk -v entry="$entry" '!done && /^## / { printf "%s\n", entry; done = 1 } { print }' "$CHANGELOG" > "$CHANGELOG.tmp"
  mv "$CHANGELOG.tmp" "$CHANGELOG"
}

main()
{
  local build=true

  if [ "${1:-}" = "--no-build" ]
  then
    build=false
    shift
  fi

  local new="${1:-}"

  if [ -z "$new" ]
  then
    new=$(latest_release)
  fi

  if ! [[ "$new" =~ $VERSION_PATTERN ]]
  then
    fatal "'$new' is not a Dashy version such as 4.9.0."
  fi

  local old
  old=$(current_version)

  if [ "$old" = "$new" ]
  then
    echo "Already on Dashy $new."
    exit 0
  fi

  # Newer Dashy versions may save conf.yml in a form older ones do not accept.
  if [ "$(printf '%s\n' "$old" "$new" | sort -V | tail -n 1)" = "$old" ]
  then
    fatal "Dashy $new is older than the current $old; downgrades are not supported."
  fi

  echo "Updating Dashy $old -> $new"
  check_image "$new"
  update_files "$old" "$new"
  add_changelog_entry "$new"

  if [ "$build" = true ]
  then
    echo "Building the image to check it still builds..."
    docker build -t local/dashy-app "$REPO_ROOT/dashy"
  fi

  cat <<EOF

Dashy $old -> $new prepared. Next:

  1. Read the release notes: $RELEASES_URL
  2. Test the update on existing configuration (see .docs/development.md).
  3. Review the diff and release:

       git diff
       git commit -am "Update Dashy to $new"
       git tag $new
       git push && git push --tags
EOF
}

main "$@"
