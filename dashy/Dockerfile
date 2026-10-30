# Dashy, packaged as a Home Assistant app.
#
# The upstream image is pinned to an exact release. Bump this tag and the
# `version` in config.yaml together (see .docs/releasing.md).
FROM lissy93/dashy:4.9.0

# The upstream image runs as the node user. run.sh starts as root to prepare the
# app configuration folder and start nginx, then runs Dashy and the login check
# as node with su-exec.
USER root

# bash runs run.sh, jq reads the app options from /data/options.json, su-exec
# drops privileges, and nginx sits in front of Dashy (see nginx.conf).
RUN apk add --no-cache bash jq su-exec nginx

COPY nginx.conf /etc/nginx/nginx.conf
COPY default-conf.yml ha-login.mjs healthz.txt /opt/dashy-app/
COPY run.sh /run.sh
RUN chmod 0755 /run.sh

# The Supervisor shows the app as starting until this check passes, and its
# watchdog restarts the app when it fails. The upstream check runs only every
# five minutes, so the app would show as starting for that long. It requests
# /healthz through nginx on port 8080, so it covers nginx and Dashy together.
HEALTHCHECK --start-period=1m --interval=30s --timeout=10s --retries=3 \
  CMD [ "node", "/app/services/healthcheck.js" ]

# The upstream ENTRYPOINT, tini, stays PID 1 and forwards stop signals to Dashy.
CMD [ "/run.sh" ]
