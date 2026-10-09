#!/usr/bin/env bash
# Arranca una imitación mínima de Supabase para tests e2e cuando `supabase start`
# no está disponible (sin Docker Hub): Postgres 16 local + PostgREST (Docker) +
# pasarela de autenticación en Node. Uso: scripts/local-stack/start.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
DATA="${LOCAL_STACK_DIR:-/tmp/poliknow-local-stack}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGPORT=54322
export JWT_SECRET="${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}"
export DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT/postgres"

mkdir -p "$DATA"
chown postgres "$DATA" 2>/dev/null || true
run_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }

if [ ! -f "$DATA/pg/PG_VERSION" ]; then
  run_pg "$PGBIN/initdb -D $DATA/pg -U postgres --auth=trust >/dev/null"
  run_pg "$PGBIN/pg_ctl -D $DATA/pg -o '-p $PGPORT -k $DATA' -l $DATA/pg.log start >/dev/null"
  psql -q -h 127.0.0.1 -p $PGPORT -U postgres -v ON_ERROR_STOP=1 -f "$DIR/bootstrap.sql"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    psql -q -h 127.0.0.1 -p $PGPORT -U postgres -v ON_ERROR_STOP=1 -f "$f"
  done
else
  run_pg "$PGBIN/pg_ctl -D $DATA/pg -o '-p $PGPORT -k $DATA' -l $DATA/pg.log start >/dev/null" || true
fi

docker rm -f poliknow-postgrest >/dev/null 2>&1 || true
docker run -d --name poliknow-postgrest --network host \
  -e PGRST_DB_URI="postgres://authenticator:authenticator@127.0.0.1:$PGPORT/postgres" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$JWT_SECRET" -e PGRST_SERVER_PORT=54330 \
  postgrest/postgrest:v16.4 >/dev/null

nohup node "$DIR/gateway.mjs" > "$DATA/gateway.log" 2>&1 &
echo $! > "$DATA/gateway.pid"
sleep 2
echo "Supabase local: http://127.0.0.1:54321 (clave publicable: cualquiera)"
