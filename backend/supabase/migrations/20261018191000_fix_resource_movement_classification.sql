-- Correctly distinguish assignment reservations, releases and field use in the ledger.
create or replace function private.log_resource_stock_movement()
returns trigger language plpgsql security definer set search_path=public as $$
declare d int;rd int;kind text;qty int;why text;
begin
 d:=new.quantity_available-old.quantity_available;rd:=new.quantity_reserved-old.quantity_reserved;
 if d=0 and rd=0 then return new;end if;
 kind:=case when rd>0 and d<0 then 'reserved' when rd<0 and d>0 then 'released' when rd<0 and d=0 then 'used' when d>0 then 'received' else 'used'end;
 qty:=greatest(abs(d),abs(rd));
 why:=coalesce(nullif(current_setting('resqnet.reason',true),''),case kind when 'reserved' then 'Reserved for rescue assignment' when 'released' then 'Released from rescue assignment' when 'used' then 'Used or removed from inventory' else 'Inventory received' end);
 insert into public.resource_movements(resource_id,movement_type,quantity,reason,actor_id)values(new.id,kind,qty,why,auth.uid());
 return new;
end $$;
