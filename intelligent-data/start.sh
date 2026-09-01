#!/usr/bin/env bash
set -e

cd /data/ocr/intelligent-data
set -a
. ./.env
set +a

exec python backend/server.py
