#!/usr/bin/env sh
# Inventory of live product references.
#
# The old brand is allowed to survive in exactly three places, and each of them
# is listed below with the reason:
#
#   1. the legal and historical files (LICENSE, NOTICE.md, CHANGELOG.md and
#      the plans under docs/superpowers/) -- the licence, the copyright
#      attribution and the third-party media warnings are the upstream's and
#      are not this project's to rewrite;
#   2. the product-identity module and the brand-substitution table, which
#      hold the legacy identifiers on purpose: one reads the old key a phone
#      already has, the other has to know the old spelling to rewrite it;
#   3. the identifiers that name something already on a device or on the wire
#      -- a plan file's format marker, the media folder, the device-id
#      endpoint, the service worker's cache names, the hashing salts and the
#      weak-password list. Renaming those would orphan people's photos,
#      invalidate stored codes or break pairing.
#
# A URL that points at the upstream project is not a live product reference:
# that is where this code comes from, and where the AGPL attribution points.
# URLs are stripped before the brand is looked for.
#
#   ./scripts/check-brand.sh          # exit 1 and a list of what to fix
#
set -eu

cd "$(dirname "$0")/.."

# The files the plan leaves alone, and the files that keep the old spelling
# for a reason of their own.
set -- ':!LICENSE' ':!NOTICE.md' ':!CHANGELOG.md' ':!docs/superpowers/**' \
       ':!frontend/src/lib/product.js' \
       ':!frontend/src/lib/product.test.js' \
       ':!frontend/src/lib/i18n-core.js' \
       ':!frontend/src/lib/i18n-core.test.js' \
       ':!scripts/check-brand.sh' \
       '.'

# Identifiers that name something that already exists on a device or on the
# wire. Listed longest first: the list is consumed as plain substrings.
allowed_identifiers='opengym-coach-v1
opengym-state-owner.json
opengym-backup-folder.json
opengym-device-id
opengym-media-v1
opengym-media-sync
opengym-remote.json
opengym-state.json
opengym-backup.json
opengym-stash.json
opengym-coach.json
opengym-device
opengym-media
opengym-rt-
opengym-link:
opengym-reset:
opengym_plan'

allowed_pattern=$(printf '%s' "$allowed_identifiers" | tr '\n' '|' | sed 's/|$//')

# The weak-password list rejects the old brand, so it has to name it.
allowed_quoted="'opengym'|'opengym123'|'opengym1234'"

matches=$(git grep --untracked -I -n -E 'openGym|opengym|OpenGym' -- "$@" || true)

# Drop the URLs, the allowed identifiers and the allowed quoted word; what is
# left is a live product reference.
bad=$(printf '%s\n' "$matches" \
  | sed -E \
      -e 's#(https?|capacitor)://[^[:space:]"'"'"'<>]+##g' \
      -e 's#ghcr\.io/[^[:space:]"'"'"'<>]+##g' \
      -e "s#($allowed_quoted)##g" \
      -e "s#($allowed_pattern)##g" \
  | grep -E 'openGym|opengym|OpenGym' || true)

if [ -n "$bad" ]; then
  printf '%s\n' "$bad"
  echo
  echo "Live product references found. Use 'Gym&Me' in copy and 'gymandme' in identifiers." >&2
  exit 1
fi

echo "No live product references outside the documented exceptions."
