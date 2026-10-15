#!/usr/bin/env bash
# Start Mongo if needed, run the backend suite with coverage, exit non-zero on failure.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx cogni-mongo; then
  docker start cogni-mongo 2>/dev/null || \
    docker run -d --name cogni-mongo --ulimit nofile=65536:65536 -p 27017:27017 mongo:7
  # Wait until mongod accepts connections
  for i in $(seq 1 30); do
    if docker exec cogni-mongo mongosh --quiet --eval 'db.runCommand({ping:1})' >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

# shellcheck disable=SC1091
source .venv/bin/activate

export LLM_PROVIDER=mock
export MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017}"

python -m pytest \
  --cov=app \
  --cov-report=term-missing \
  --cov-report=html:htmlcov \
  "$@"
