#!/bin/bash
# Builds Claudenspiel into one file, claudenspiel/claudenspiel.html, from claudenspiel/src only.
# It never reads or writes anything outside claudenspiel/ (Kartenspiel's own build is ../build.sh).
set -e
cd "$(dirname "$0")"
{
cat <<'H'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Claudenspiel</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Tiny5&text=%E2%97%8F&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Jacquard+24&display=swap" rel="stylesheet">
<style>
H
echo ":root { --logo: url(data:image/png;base64,$(base64 -w0 assets/logo.png)); }"
cat src/style.css src/claudenspiel.css
echo '</style></head><body><div id="app"></div><script>'
cat src/data.js src/engine.js src/bots.js src/cardface.js src/cardart.js src/patchnotes.js src/ui.js
echo '</script></body></html>'
} > claudenspiel.html
echo "built claudenspiel/claudenspiel.html ($(wc -c < claudenspiel.html) bytes)"
