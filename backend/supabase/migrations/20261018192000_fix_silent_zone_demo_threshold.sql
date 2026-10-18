-- Silent zones use the reference threshold (0.60). Ensure labelled demo areas exercise it.
update public.areas set elderly_share=.42,disability_share=.38,living_alone_share=.45,low_income_share=.72,poor_housing_share=.65,poor_signal_share=.58 where name='Demo: Rawal Lake East';
update public.areas set elderly_share=.50,disability_share=.50,living_alone_share=.50,low_income_share=.80,poor_housing_share=.80,poor_signal_share=.80 where name='Demo: Bari Imam';
create or replace function public.list_silent_zones()
returns table(area_id uuid,area_name text,vulnerability_index numeric,population integer,recent_reports bigint,active_hazards bigint,is_demo boolean)
language sql security definer set search_path=public,extensions as $$
 select a.id,a.name,a.vulnerability_index,a.population,
 (select count(*) from public.incidents i where i.area_id=a.id and i.created_at>now()-interval '3 hours'),
 (select count(*) from public.hazard_events h where h.area_id=a.id and h.active and(h.expires_at is null or h.expires_at>now())),a.is_demo
 from public.areas a where a.vulnerability_index>=.6
 and exists(select 1 from public.hazard_events h where h.area_id=a.id and h.active and(h.expires_at is null or h.expires_at>now()))
 and(select count(*) from public.incidents i where i.area_id=a.id and i.created_at>now()-interval '3 hours')<greatest(1,ceil(a.population/2000.0));
$$;
