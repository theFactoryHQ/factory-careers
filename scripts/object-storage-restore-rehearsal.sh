#!/usr/bin/env bash
set -euo pipefail

# Rehearses S3-compatible object storage backup/restore mechanics for Reqcore
# document storage. This uses disposable MinIO containers and a sentinel object,
# so it never touches real candidate documents.

SOURCE_CONTAINER="${SOURCE_CONTAINER:-reqcore-object-rehearsal-source-$$}"
TARGET_CONTAINER="${TARGET_CONTAINER:-reqcore-object-rehearsal-target-$$}"
NETWORK="${NETWORK:-reqcore-object-rehearsal-$$}"
MINIO_IMAGE="${MINIO_IMAGE:-minio/minio:RELEASE.2025-09-07T16-13-09Z}"
MC_IMAGE="${MC_IMAGE:-minio/mc:RELEASE.2025-08-13T08-35-41Z}"
CLEANUP_IMAGE="${CLEANUP_IMAGE:-alpine:3.20}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-reqcore}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-reqcore-object-rehearsal-secret}"
BUCKET="${S3_BUCKET:-reqcore}"
TMP_DIR="$(mktemp -d)"
BACKUP_DIR="${TMP_DIR}/object-storage-backup"
SENTINEL_KEY="org-rehearsal/candidate-rehearsal/documents/sentinel.txt"
SENTINEL_CONTENT="reqcore-object-restore-rehearsal-${RANDOM}-$$"

cleanup() {
  docker rm -f "$SOURCE_CONTAINER" "$TARGET_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  if [[ "${KEEP_OBJECT_REHEARSAL_ARTIFACTS:-}" != "1" ]]; then
    if ! rm -rf "$TMP_DIR" 2>/dev/null; then
      docker run --rm \
        -v "$TMP_DIR:/work" \
        "$CLEANUP_IMAGE" \
        sh -c 'rm -rf /work/* /work/.[!.]* /work/..?*' >/dev/null 2>&1 || true
      rm -rf "$TMP_DIR" 2>/dev/null || true
    fi
  else
    echo "Keeping object storage rehearsal artifacts in $TMP_DIR"
  fi
}
trap cleanup EXIT

run_mc() {
  docker run --rm \
    --network "$NETWORK" \
    -v "$TMP_DIR:/work" \
    "$MC_IMAGE" \
    --config-dir /work/.mc "$@"
}

wait_for_minio() {
  local alias_name="$1"
  local container="$2"

  for _ in $(seq 1 60); do
    if run_mc alias set "$alias_name" "http://${container}:9000" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 \
      && run_mc ls "$alias_name" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  docker logs "$container" >&2 || true
  echo "MinIO container $container did not become ready" >&2
  return 1
}

docker rm -f "$SOURCE_CONTAINER" "$TARGET_CONTAINER" >/dev/null 2>&1 || true
docker network rm "$NETWORK" >/dev/null 2>&1 || true
docker network create "$NETWORK" >/dev/null
mkdir -p "$BACKUP_DIR"

docker run -d \
  --name "$SOURCE_CONTAINER" \
  --network "$NETWORK" \
  -e MINIO_ROOT_USER="$MINIO_ROOT_USER" \
  -e MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
  "$MINIO_IMAGE" server /data --console-address ":9001" >/dev/null
wait_for_minio source "$SOURCE_CONTAINER"

printf '%s\n' "$SENTINEL_CONTENT" > "${TMP_DIR}/sentinel.txt"
run_mc mb --ignore-existing "source/${BUCKET}" >/dev/null
run_mc cp "/work/sentinel.txt" "source/${BUCKET}/${SENTINEL_KEY}" >/dev/null
run_mc mirror --overwrite "source/${BUCKET}" "/work/object-storage-backup/${BUCKET}" >/dev/null

if [[ ! -s "${BACKUP_DIR}/${BUCKET}/${SENTINEL_KEY}" ]]; then
  echo "Object storage backup did not contain sentinel object: ${SENTINEL_KEY}" >&2
  exit 1
fi

docker run -d \
  --name "$TARGET_CONTAINER" \
  --network "$NETWORK" \
  -e MINIO_ROOT_USER="$MINIO_ROOT_USER" \
  -e MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
  "$MINIO_IMAGE" server /data --console-address ":9001" >/dev/null
wait_for_minio target "$TARGET_CONTAINER"

run_mc mb --ignore-existing "target/${BUCKET}" >/dev/null
run_mc mirror --overwrite "/work/object-storage-backup/${BUCKET}" "target/${BUCKET}" >/dev/null
run_mc cp "target/${BUCKET}/${SENTINEL_KEY}" "/work/restored-sentinel.txt" >/dev/null

if ! cmp -s "${TMP_DIR}/sentinel.txt" "${TMP_DIR}/restored-sentinel.txt"; then
  echo "Object storage restore verification failed: restored sentinel differs from source" >&2
  exit 1
fi

object_count="$(find "${BACKUP_DIR}/${BUCKET}" -type f | wc -l | tr -d ' ')"
backup_bytes="$(du -sk "${BACKUP_DIR}/${BUCKET}" | awk '{print $1 * 1024}')"

echo "Object storage backup/restore rehearsal passed"
echo "MinIO image: $MINIO_IMAGE"
echo "mc image: $MC_IMAGE"
echo "Bucket: $BUCKET"
echo "Backup bytes: $backup_bytes"
echo "Verified object count: $object_count"
echo "Verified sentinel key: $SENTINEL_KEY"
