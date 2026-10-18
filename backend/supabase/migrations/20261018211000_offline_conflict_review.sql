create or replace function public.record_sync_conflict(p_idempotency_key uuid,p_operation_type text,p_payload jsonb,p_error text)
returns void language plpgsql security definer set search_path=public as $$ begin
 insert into public.sync_operations(idempotency_key,user_id,operation_type,payload,status,error)
 values(p_idempotency_key,auth.uid(),left(p_operation_type,50),p_payload,'conflict',left(p_error,500)) on conflict(idempotency_key) do nothing;
end $$;
revoke execute on function public.record_sync_conflict(uuid,text,jsonb,text) from public;
grant execute on function public.record_sync_conflict(uuid,text,jsonb,text) to authenticated;
create policy sync_admin_review on public.sync_operations for select to authenticated using(private.is_admin());
