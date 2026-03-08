#!/bin/sh
set -e

# Enforce restrictive file permissions for SQLite database files.
# umask 0077 ensures new files are created with mode 0600 (owner read/write only)
# and new directories with mode 0700 (owner only).
umask 0077

# Fix permissions on any existing SQLite files from previous runs
# (e.g., when using persistent Docker volumes).
for f in /app/.run/*.db /app/.run/*.db-wal /app/.run/*.db-shm; do
  [ -e "$f" ] && chmod 0600 "$f"
done

exec "$@"
