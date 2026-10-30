#!/bin/bash
# Builds index.html: the HTML shell, then style.css inline, then the three scripts in load order.
# data.js and engine.js must come before ui.js.
{
cat <<'H'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Kartenspiel — playtest table</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
H
cat src/style.css
echo '</style></head><body><div id="app"></div><script>'
cat src/data.js src/engine.js src/ui.js
echo '</script></body></html>'
} > index.html
