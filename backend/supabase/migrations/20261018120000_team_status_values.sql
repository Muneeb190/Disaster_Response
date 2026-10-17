/*
  New team statuses for the availability board.
  Kept in its own migration: Postgres cannot use a new enum value in the
  same transaction that adds it.

  available   = free
  assigned    = busy (has an assignment, not yet travelling)
  en_route    = travelling to an incident
  unavailable = temporarily cannot respond (breakdown, rest, injury)
  offline     = off shift / not reachable
*/
alter type public.team_status add value if not exists 'en_route';
alter type public.team_status add value if not exists 'unavailable';
