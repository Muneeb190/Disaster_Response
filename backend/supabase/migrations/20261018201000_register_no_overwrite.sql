-- Unauthenticated callers must not overwrite (or learn the reference of) an existing registration by phone.
-- ponytail: changes go through coordinators; add OTP-verified self-service updates if needed.
create or replace function public.register_at_risk(p_full_name text,p_phone text,p_preferred_language text,p_needs text[],p_latitude double precision,p_longitude double precision,p_consent boolean)
returns text language plpgsql security definer set search_path=public,extensions as $$
declare r text; ph text:=regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g'); nm text:=left(trim(coalesce(p_full_name,'')),100);
 pt geography:=st_setsrid(st_makepoint(p_longitude,p_latitude),4326)::geography; aid uuid; lang text:=case when p_preferred_language='ur' then 'ur' else 'en' end;
begin
 if not coalesce(p_consent,false) then raise exception 'Consent is required'; end if;
 if length(nm)<2 or length(ph)<7 or length(ph)>16 then raise exception 'Name and reachable phone are required'; end if;
 if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'A valid location is required'; end if;
 if exists(select 1 from public.at_risk_residents where phone=ph and active) then raise exception 'This phone is already registered. Contact a coordinator to update the registration.'; end if;
 select id into aid from public.areas where st_covers(boundary,pt::geometry) limit 1;
 insert into public.at_risk_residents(full_name,phone,preferred_language,needs,location,area_id,consent_confirmed)
 values(nm,ph,lang,private.clean_vulnerability_flags(p_needs),pt,aid,true) returning reference_code into r;
 return r;
end $$;
