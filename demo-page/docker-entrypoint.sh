#!/bin/sh
set -e
NAMESERVER=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf 2>/dev/null)
NGINX_RESOLVER="${NAMESERVER:-127.0.0.11}" envsubst '${NGINX_RESOLVER}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
exec "$@"
