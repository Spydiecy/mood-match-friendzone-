#!/usr/bin/env bash
#
# Mood Match - one-command deploy to a Decentraland World.
#
# Usage:
#   ./deploy.sh                      deploy to the World in scene.json
#   ./deploy.sh my-name.dcl.eth      deploy to a specific World
#
# Signing:
#   By default the CLI opens a browser to sign the deployment with your wallet.
#   For CI, set DCL_PRIVATE_KEY and it signs without a browser.
#
set -euo pipefail

PLACEHOLDER="CHANGE-ME.dcl.eth"
CONTENT_SERVER="https://worlds-content-server.decentraland.org"

cd "$(dirname "$0")"

# --- Resolve the target World ------------------------------------------------

if [[ $# -ge 1 ]]; then
  WORLD="$1"
  echo "Setting worldConfiguration.name to $WORLD"
  node -e "
    const fs = require('fs');
    const scene = JSON.parse(fs.readFileSync('scene.json', 'utf8'));
    scene.worldConfiguration = scene.worldConfiguration || {};
    scene.worldConfiguration.name = process.argv[1];
    fs.writeFileSync('scene.json', JSON.stringify(scene, null, 2) + '\n');
  " "$WORLD"
else
  WORLD=$(node -e "
    const scene = require('./scene.json');
    process.stdout.write((scene.worldConfiguration && scene.worldConfiguration.name) || '');
  ")
fi

if [[ -z "$WORLD" || "$WORLD" == "$PLACEHOLDER" ]]; then
  cat <<EOF

ERROR: no Decentraland World configured.

Mood Match deploys to a World, which needs a Decentraland NAME or an ENS domain
owned by the wallet that signs the deployment.

Fix it one of two ways:

  1. Pass the name directly:
       ./deploy.sh your-name.dcl.eth

  2. Or edit scene.json and replace "$PLACEHOLDER":
       "worldConfiguration": { "name": "your-name.dcl.eth" }

You can check which NAMEs your wallet owns at:
  https://decentraland.org/builder/names

EOF
  exit 1
fi

echo "Target World: $WORLD"

# --- Verify before shipping --------------------------------------------------

echo
echo "==> Checking game rules"
npm run --silent check

echo
echo "==> Production build (no sourcemaps)"
npm run --silent build:production

echo
echo "==> Deployable payload"
du -sh assets bin images main.crdt 2>/dev/null || true

# --- Deploy ------------------------------------------------------------------

echo
if [[ -n "${DCL_PRIVATE_KEY:-}" ]]; then
  echo "==> Deploying with DCL_PRIVATE_KEY (non-interactive)"
else
  echo "==> Deploying - a browser window will open for you to sign"
fi

# --skip-build because we just built in production mode; the CLI's own build
# would otherwise re-run it with sourcemaps and inflate the upload.
npx sdk-commands deploy --target-content "$CONTENT_SERVER" --skip-build

cat <<EOF

Deployed.

  Visit:  https://decentraland.org/jump/?realm=$WORLD
  In-world chat command:  /goto $WORLD

Note: 3D assets are converted server-side after publishing. Allow 30-60 minutes
before the new version is reliably playable, especially on mobile.

Server logs (the wallet must be listed in scene.json logsPermissions):
  npm run server-logs -- --world $WORLD

EOF
