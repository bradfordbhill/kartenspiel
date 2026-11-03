#!/bin/bash
# Publishes Claudenspiel to GitHub Pages at https://bradfordbhill.github.io/claudenspiel/
# It builds claudenspiel.html and pushes it, as index.html, to the main branch of its own repository,
# github.com/bradfordbhill/claudenspiel, which Pages serves as-is (Settings → Pages → Deploy from a branch → main, / (root)).
# Kartenspiel's repository and site are not touched. The page is the offline edition: single player, pass-and-play,
# sandbox and card builder; there is no online play.
# Run from anywhere: claudenspiel/tools/publish.sh   (REPO=owner/name overrides the target)
set -e
cd "$(dirname "$0")/.."
REPO="${REPO:-bradfordbhill/claudenspiel}"
./build.sh
out=$(mktemp -d)
cp claudenspiel.html "$out/index.html"
touch "$out/.nojekyll"   # serve the file as-is, no Jekyll processing
cat > "$out/README.md" <<EOF
# Claudenspiel

Claude's own fork of Kartenspiel, built from \`claudenspiel/\` in [bradfordbhill/kartenspiel](https://github.com/bradfordbhill/kartenspiel).
Play it at https://${REPO%%/*}.github.io/${REPO##*/}/ (offline edition: single player against bots, pass-and-play, sandbox, card builder).

This repository only holds the published page; \`claudenspiel/tools/publish.sh\` rewrites it on every publish.
EOF
src=$(git -C .. rev-parse --short HEAD)
cd "$out"
git init -q -b main
git add -A
git -c user.name="$(git -C "$OLDPWD/.." config user.name || echo Claude)" -c user.email="$(git -C "$OLDPWD/.." config user.email || echo noreply@anthropic.com)" commit -q -m "Publish Claudenspiel (from kartenspiel@$src)"
git push -q -f "https://github.com/$REPO.git" main
echo "Published to https://github.com/$REPO (main). Pages: https://${REPO%%/*}.github.io/${REPO##*/}/"
