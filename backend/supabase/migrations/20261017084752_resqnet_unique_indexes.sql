/*
# Add unique constraints for seed idempotency
team_code and resources.name need unique constraints so ON CONFLICT works.
*/
create unique index if not exists idx_teams_code_unique on rescue_teams(team_code);
create unique index if not exists idx_resources_name_unique on resources(name);
