#!/bin/sh
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$here"
: "${1:?Supply the absolute path to a new empty public build directory}"
case "$1" in /*) ;; *) echo 'An absolute output path is required' >&2;exit 2;; esac
if [ -e "$1" ];then echo 'Choose a new output path; existing publication will not be overwritten' >&2;exit 2;fi
python3 -S scripts/prepare_site.py --check
python3 -S scripts/update_economy.py --check
python3 -S scripts/prepare_living.py --check
hugo --minify -s site -d "$1"
python3 -S scripts/pack_transport.py --public "$1"
