#!/usr/bin/env bash
set -euo pipefail

# Rehearses the PostgreSQL dump/restore mechanics used by the production
# runbook. This intentionally uses disposable Docker containers and a sentinel
# table so it never touches a real Reqcore database.

SOURCE_CONTAINER="${SOURCE_CONTAINER:-reqcore-backup-rehearsal-source-$$}"
TARGET_CONTAINER="${TARGET_CONTAINER:-reqcore-backup-rehearsal-target-$$}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-reqcore-rehearsal}"
TMP_DIR="$(mktemp -d)"
BACKUP_PATH="${TMP_DIR}/reqcore-rehearsal.sql"

cleanup() {
  docker rm -f "$SOURCE_CONTAINER" "$TARGET_CONTAINER" >/dev/null 2>&1 || true
  if [[ "${KEEP_BACKUP_REHEARSAL_ARTIFACTS:-}" != "1" ]]; then
    rm -rf "$TMP_DIR"
  else
    echo "Keeping rehearsal artifacts in $TMP_DIR"
  fi
}
trap cleanup EXIT

wait_for_postgres() {
  local container="$1"
  for _ in $(seq 1 60); do
    if docker exec -e PGHOST=127.0.0.1 "$container" pg_isready -U postgres >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  docker logs "$container" >&2 || true
  echo "Postgres container $container did not become ready" >&2
  return 1
}

docker rm -f "$SOURCE_CONTAINER" "$TARGET_CONTAINER" >/dev/null 2>&1 || true

docker run -d \
  --name "$SOURCE_CONTAINER" \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  "$POSTGRES_IMAGE" >/dev/null
wait_for_postgres "$SOURCE_CONTAINER"

docker exec -e PGHOST=127.0.0.1 "$SOURCE_CONTAINER" createdb -U postgres reqcore
docker exec -i -e PGHOST=127.0.0.1 "$SOURCE_CONTAINER" psql -U postgres -d reqcore -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create table restore_sentinel (
  id text primary key,
  marker text not null,
  created_at timestamptz not null default now()
);

insert into restore_sentinel (id, marker)
values ('sentinel-1', 'reqcore-restore-rehearsal');
SQL

docker exec -e PGHOST=127.0.0.1 "$SOURCE_CONTAINER" \
  pg_dump -U postgres --no-owner --no-acl reqcore > "$BACKUP_PATH"

if [[ ! -s "$BACKUP_PATH" ]]; then
  echo "Backup file was not created or is empty: $BACKUP_PATH" >&2
  exit 1
fi

docker run -d \
  --name "$TARGET_CONTAINER" \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  "$POSTGRES_IMAGE" >/dev/null
wait_for_postgres "$TARGET_CONTAINER"

docker exec -e PGHOST=127.0.0.1 "$TARGET_CONTAINER" createdb -U postgres reqcore
docker exec -i -e PGHOST=127.0.0.1 "$TARGET_CONTAINER" \
  psql -U postgres -d reqcore -v ON_ERROR_STOP=1 < "$BACKUP_PATH" >/dev/null

restored_count="$(
  docker exec -e PGHOST=127.0.0.1 "$TARGET_CONTAINER" \
    psql -U postgres -d reqcore -tAc \
      "select count(*) from restore_sentinel where marker = 'reqcore-restore-rehearsal';"
)"

if [[ "$restored_count" != "1" ]]; then
  echo "Restore verification failed: expected sentinel count 1, got $restored_count" >&2
  exit 1
fi

echo "Backup/restore rehearsal passed"
echo "Postgres image: $POSTGRES_IMAGE"
echo "Backup bytes: $(wc -c < "$BACKUP_PATH" | tr -d ' ')"
echo "Verified sentinel rows: $restored_count"
