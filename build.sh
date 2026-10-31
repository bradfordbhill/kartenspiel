#!/bin/bash
# Builds two single-file apps from src/:
#   index.html       the playtest table: card builder, sandbox, referee tools
#   site/index.html  the public site: pass-and-play and online multiplayer, with a fixed card library
# Set KARTENSPIEL_SERVER to the game server's address (https://...) to build it into the public site.
set -e
cd "$(dirname "$0")"

# page TITLE HEAD SCRIPTS... : the HTML shell (HEAD = extra tags for <head>), style.css inline, then the scripts in load order.
page() {
  local title="$1" head="$2"; shift 2
cat <<H
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>$title</title>
$head
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Tiny5&text=%E2%97%8F&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Jacquard+24&display=swap" rel="stylesheet">
<style>
H
  # the Fraktur logo bitmap (assets/logo.png, drawn by tools/art.js), inlined so both apps stay single files
  echo ":root { --logo: url(data:image/png;base64,$(base64 -w0 assets/logo.png)); }"

  cat src/style.css
  echo '</style></head><body><div id="app"></div><script>'
  cat "$@"
  echo '</script></body></html>'
}

page 'Kartenspiel — playtest table' '' src/data.js src/engine.js src/bots.js src/cardface.js src/cardart.js src/ui.js > index.html

mkdir -p site
server=$(node -e 'process.stdout.write(JSON.stringify(process.env.KARTENSPIEL_SERVER || ""))')
echo "var KConfig = { edition: 'online', server: $server };" > site/config.js.tmp
# the public site is an installable app: manifest, icons, and a service worker for offline play
app_head='<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#000080">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Kartenspiel">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" href="icons/favicon-32.png">'
page 'Kartenspiel' "$app_head" site/config.js.tmp src/data.js src/engine.js src/bots.js src/net.js src/cardface.js src/cardart.js src/ui.js > site/index.html
rm site/config.js.tmp
mkdir -p site/icons
cp assets/icons/*.png site/icons/
cp assets/manifest.webmanifest site/
# a new page means a new cache: the service worker's version is a hash of the page
version=$(node -e 'process.stdout.write(require("crypto").createHash("sha1").update(require("fs").readFileSync("site/index.html")).digest("hex").slice(0, 12))')
sed "s/__VERSION__/$version/" src/sw.js > site/sw.js

# Dithry, the pixel-art and dithered-gradient paint app (dithry/): one file for the repo root and one for the site
dithry_page() {
cat <<'H'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Dithry · Pixel Art and Dithered Gradient Tool</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'%3E%3Crect width='8' height='8' fill='%23fff'/%3E%3Cpath d='M0 0h8v3H0zM0 3h1v1H0zM2 3h1v1H2zM4 3h1v1H4zM6 3h1v1H6zM1 4h1v1H1zM5 4h1v1H5zM3 5h1v1H3zM7 5h1v1H7z' fill='%231c1f3a'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Tiny5&text=%E2%97%8F&display=swap" rel="stylesheet">
<style>
H
  cat dithry/dithry.css
  echo '</style></head><body><div id="app"></div><script>'
  # card mode shows card text with Kartenspiel's own stylesheet and face markup, over the painting
  node -e 'process.stdout.write("var KCardCSS = " + JSON.stringify(require("fs").readFileSync("src/style.css", "utf8")) + ";\n")'
  cat src/data.js src/cardface.js src/cardart.js dithry/engine.js dithry/app.js dithry/cards.js
  echo '</script></body></html>'
}
dithry_page > dithry.html
mkdir -p site/dithry
cp dithry.html site/dithry/index.html
