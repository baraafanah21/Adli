#!/usr/bin/env bash
# Phase E1: two real sessions racing for the same barber and time. The SQL Editor runs one session at a time, so this
# needs psql and the database connection string (Supabase → Connect → Session pooler), e.g.
#   DATABASE_URL='postgresql://postgres.hdkmrozwihaoqiqjlzld:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres' \
#     bash supabase/tests/phase-e1-concurrency.sh
#
# Session A inserts a booking and holds its transaction open for 3 seconds; session B inserts an overlapping one
# meanwhile. Expected: B waits for A, then fails with 23P01 (bookings_no_overlap). This is the database's own
# guarantee, underneath create_booking's day lock. Committed test rows (an inactive barber and its bookings) are
# deleted at the end, whatever happens.
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"

ERR=$(mktemp)
BARBER=00000000-0000-4000-8000-0000000000e1
DAY="(now() at time zone 'Asia/Hebron')::date + 30"   # far outside the booking window: no customer can see it
RANGE="tstzrange(($DAY + time '13:00') at time zone 'Asia/Hebron', ($DAY + time '13:30') at time zone 'Asia/Hebron')"
INSERT="insert into public.bookings (kind, barber_id, service_id, service_name_ar, price_ils, duration_min, during, status)
        select 'walk_in', '$BARBER', id, 'اختبار التزامن', 0, 30, $RANGE, 'confirmed' from public.services where slug = 'full-cut'"

cleanup() {
  psql "$DATABASE_URL" -qAt -c "delete from public.bookings where barber_id = '$BARBER'; delete from public.barbers where id = '$BARBER';" >/dev/null
  rm -f "$ERR"
}
trap cleanup EXIT

psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 \
  -c "insert into public.barbers (id, name_ar, is_active, sort) values ('$BARBER', 'اختبار التزامن', false, 999);" >/dev/null

psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "begin; $INSERT; select pg_sleep(3); commit;" >/dev/null &
A=$!
sleep 1
start=$(date +%s)
if psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "$INSERT;" 2>"$ERR" >/dev/null; then
  echo "FAIL: session B inserted an overlapping booking"
else
  waited=$(( $(date +%s) - start ))
  echo "session B refused after ~${waited}s (expect ~2s, it waited for A): $(grep -o 'conflicting key value violates exclusion constraint "[a-z_]*"' "$ERR" || cat "$ERR")"
fi
wait "$A" && echo "session A committed"
echo "rows for the test barber: $(psql "$DATABASE_URL" -qAt -c "select count(*) from public.bookings where barber_id = '$BARBER'") (expect 1)"
