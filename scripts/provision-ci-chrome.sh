#!/usr/bin/env bash
set -euo pipefail

chrome=/opt/google/chrome/chrome
if [[ ! -x "$chrome" ]]; then
  # The Playwright image already supplies the browser's system libraries.
  # Extract Google's stable Chrome package without refreshing Ubuntu indexes.
  staging=$(mktemp -d)
  trap 'rm -rf -- "$staging"' EXIT
  package="$staging/chrome.deb"
  curl --fail --silent --show-error --location \
    --proto '=https' --proto-redir '=https' \
    --connect-timeout 15 --max-time 120 --retry 2 --retry-all-errors \
    https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    --output "$package"
  [[ "$(dpkg-deb --field "$package" Package)" == google-chrome-stable ]]
  [[ "$(dpkg-deb --field "$package" Architecture)" == amd64 ]]
  dpkg-deb --extract "$package" "$staging/extracted"
  test -x "$staging/extracted$chrome"
  if [[ $EUID -eq 0 ]]; then
    install -d /opt/google/chrome
    cp -a "$staging/extracted/opt/google/chrome/." /opt/google/chrome/
  else
    sudo install -d /opt/google/chrome
    sudo cp -a "$staging/extracted/opt/google/chrome/." /opt/google/chrome/
  fi
fi

"$chrome" --version
