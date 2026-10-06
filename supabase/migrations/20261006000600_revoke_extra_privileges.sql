-- Phase C cleanup: the API roles never need TRUNCATE, TRIGGER or REFERENCES.
-- TRUNCATE in particular is not subject to RLS. SELECT / INSERT / UPDATE / DELETE stay as they are
-- (RLS and the column grants in 20261006000500_accounts.sql decide those).

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- Tables created later (by migrations run as postgres) don't get them back.
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
