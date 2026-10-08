-- Phase E3.1 fix (applied on the live database as phone_normalize_trigger_security_definer, 2026-10-07 23:57 UTC).
-- private.phone_normalize() runs as the trigger on profiles and orders. As SECURITY INVOKER it ran as the signed-in
-- customer, who has no EXECUTE on private.normalize_mobile(), so saving «بياناتي» failed with 42501. As SECURITY
-- DEFINER it runs as its owner; it is still not callable by anyone directly.
-- Rule: a trigger function that calls anything in private.* is security definer, and its test runs as a plain
-- authenticated customer, not as the owner.

alter function private.phone_normalize() security definer;
revoke all on function private.phone_normalize() from public, anon, authenticated;
