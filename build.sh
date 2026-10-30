#!/bin/bash
# Builds two single-file apps from src/:
#   index.html       the playtest table: card builder, sandbox, referee tools
#   site/index.html  the public site: pass-and-play and online multiplayer, with a fixed card library
# Set KARTENSPIEL_SERVER to the game server's address (https://...) to build it into the public site.
set -e
cd "$(dirname "$0")"

# page TITLE SCRIPTS... : the HTML shell, style.css inline, then the scripts in load order.
page() {
  local title="$1"; shift
cat <<H
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>$title</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
H
  cat src/style.css
  echo '</style></head><body><div id="app"></div><script>'
  cat "$@"
  echo '</script></body></html>'
}

page 'Kartenspiel — playtest table' src/data.js src/engine.js src/ui.js > index.html

mkdir -p site
server=$(node -e 'process.stdout.write(JSON.stringify(process.env.KARTENSPIEL_SERVER || ""))')
echo "var KConfig = { edition: 'online', server: $server };" > site/config.js.tmp
page 'Kartenspiel' site/config.js.tmp src/data.js src/engine.js src/net.js src/ui.js > site/index.html
rm site/config.js.tmp
