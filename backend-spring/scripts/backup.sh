#!/usr/bin/env bash
set -euo pipefail
DIR="${BACKUP_DIR:-$HOME/backups/jobcompass}"
mkdir -p "$DIR"
FILE="$DIR/jobcompass-$(date +%Y%m%d-%H%M%S).sql.gz"
docker exec jobcompass-postgres pg_dump -U jobcompass jobcompass | gzip > "$FILE"
# a failed dump leaves a tiny file; refuse to keep it
[ "$(stat -c %s "$FILE")" -gt 1000 ] || { rm -f "$FILE"; echo "backup looked empty" >&2; exit 1; }
ls -1t "$DIR"/jobcompass-*.sql.gz | tail -n +15 | xargs -r rm --
echo "wrote $FILE"
