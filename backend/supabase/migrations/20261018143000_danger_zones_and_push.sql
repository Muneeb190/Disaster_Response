create table if not exists public.danger_zones (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references public.incidents(id) on delete cascade,
  name text not null,
  hazard_type public.incident_type not null,
  severity public.priority_level not null,
  zone geography(polygon,4326) not null,
  radius_m int not null check (radius_m between 50 and 50000),
  source text not null default 'user_report' check (source in ('user_report','coordinator','official')),
  verification_status text not null default 'provisional' check (verification_status in ('provisional','confirmed','rejected')),
  instructions text,
  active boolean not null default true,
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_danger_zones_geo on public.danger_zones using gist(zone);
create unique index if not exists idx_danger_zones_incident_auto on public.danger_zones(incident_id) where source='user_report';

create or replace function private.create_report_danger_zone()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare radius int;
begin
  if new.priority_level not in ('high','critical') or new.status in ('resolved','cancelled') then return null; end if;
  radius := case when new.priority_level='critical' then 500 else 300 end;
  insert into public.danger_zones(incident_id,name,hazard_type,severity,zone,radius_m,instructions)
  values(new.id, format('%s provisional zone',new.report_code),new.type,new.priority_level,
    st_buffer(new.location,radius)::geography,radius,
    'Unverified public report. Avoid the marked area and follow coordinator instructions.')
  on conflict (incident_id) where source='user_report' do update set
    severity=excluded.severity, zone=excluded.zone, radius_m=excluded.radius_m, active=true, updated_at=now();
  insert into public.alerts(incident_id,type,severity,message,dedup_key,entity_type,entity_id)
  values(new.id,'danger_zone',new.priority_level,format('Provisional danger zone created from %s',new.report_code),
    'danger-zone-'||new.id::text,'incident',new.id) on conflict (dedup_key) where dedup_key is not null do nothing;
  return null;
end $$;
drop trigger if exists trg_create_report_danger_zone on public.incidents;
create trigger trg_create_report_danger_zone after insert or update of priority_level,status on public.incidents
for each row execute function private.create_report_danger_zone();

create or replace function public.list_active_danger_zones()
returns table(id uuid,incident_id uuid,name text,hazard_type public.incident_type,severity public.priority_level,
  geojson jsonb,radius_m int,source text,verification_status text,instructions text,expires_at timestamptz)
language sql stable security definer set search_path=public,extensions as $$
  select z.id,z.incident_id,z.name,z.hazard_type,z.severity,st_asgeojson(z.zone::geometry)::jsonb,
    z.radius_m,z.source,z.verification_status,z.instructions,z.expires_at
  from public.danger_zones z where z.active and (z.expires_at is null or z.expires_at>now()) and z.verification_status<>'rejected';
$$;

alter table public.danger_zones enable row level security;
create policy danger_zones_authenticated_read on public.danger_zones for select to authenticated using (true);
create policy danger_zones_admin_write on public.danger_zones for all to authenticated using (private.is_admin()) with check(private.is_admin());
grant select,insert,update,delete on public.danger_zones to authenticated;
revoke execute on function public.list_active_danger_zones() from public,anon;
grant execute on function public.list_active_danger_zones() to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='danger_zones') then
    alter publication supabase_realtime add table public.danger_zones;
  end if;
end $$;

-- Backfill provisional zones for currently active high/critical reports.
insert into public.danger_zones(incident_id,name,hazard_type,severity,zone,radius_m,instructions)
select i.id,format('%s provisional zone',i.report_code),i.type,i.priority_level,
  st_buffer(i.location,case when i.priority_level='critical' then 500 else 300 end)::geography,
  case when i.priority_level='critical' then 500 else 300 end,
  'Unverified public report. Avoid the marked area and follow coordinator instructions.'
from public.incidents i where i.priority_level in ('high','critical') and i.status not in ('resolved','cancelled')
on conflict (incident_id) where source='user_report' do nothing;
