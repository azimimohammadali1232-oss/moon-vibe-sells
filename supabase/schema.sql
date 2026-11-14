-- Moon-vibe sells — طرح دیتابیس Supabase (روی پروژه‌ی moon-vibe-sells اعمال شده است)
-- مدل: هر رکورد اپ (کالا، فاکتور، گردش موجودی، ...) یک ردیف در جدول records با داده‌ی jsonb
-- برنده‌ی تعارض: updated_at جدیدتر (Last-Write-Wins) — موجودی از جمع گردش‌ها حساب می‌شود، پس فروش همزمان دو گوشی از دست نمی‌رود.

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text, user_code text,
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index members_user_idx on public.members(user_id);
create table public.records (
  id uuid primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  tbl text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null,
  srv_at timestamptz not null default clock_timestamp(),
  updated_by uuid default auth.uid()
);
create index records_store_srv_idx on public.records(store_id, srv_at);

create or replace function public.is_member(s uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.members where store_id = s and user_id = auth.uid());
$$;
create or replace function public.records_lww() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then return null; end if;
    if new.store_id <> old.store_id then raise exception 'store_id cannot change'; end if;
  end if;
  new.srv_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger records_lww_trg before insert or update on public.records for each row execute function public.records_lww();

alter table public.stores enable row level security;
alter table public.members enable row level security;
alter table public.records enable row level security;
create policy stores_select on public.stores for select to authenticated using (public.is_member(id));
create policy members_select on public.members for select to authenticated using (public.is_member(store_id));
create policy members_update_self on public.members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy records_select on public.records for select to authenticated using (public.is_member(store_id));
create policy records_insert on public.records for insert to authenticated with check (public.is_member(store_id));
create policy records_update on public.records for update to authenticated using (public.is_member(store_id)) with check (public.is_member(store_id));

create or replace function public.create_store(p_name text, p_display_name text, p_user_code text)
returns public.stores language plpgsql security definer set search_path = public as $$
declare s public.stores;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.stores(name, created_by) values (p_name, auth.uid()) returning * into s;
  insert into public.members(store_id, user_id, display_name, user_code) values (s.id, auth.uid(), p_display_name, p_user_code);
  return s;
end $$;
create or replace function public.join_store(p_code text, p_display_name text, p_user_code text)
returns public.stores language plpgsql security definer set search_path = public as $$
declare s public.stores;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into s from public.stores where join_code = upper(trim(p_code));
  if s.id is null then raise exception 'invalid code'; end if;
  insert into public.members(store_id, user_id, display_name, user_code) values (s.id, auth.uid(), p_display_name, p_user_code)
  on conflict (store_id, user_id) do update set display_name = excluded.display_name, user_code = excluded.user_code;
  return s;
end $$;
create or replace function public.my_stores() returns setof public.stores
language sql security definer stable set search_path = public as $$
  select s.* from public.stores s join public.members m on m.store_id = s.id where m.user_id = auth.uid();
$$;
revoke execute on function public.create_store(text, text, text) from public, anon;
revoke execute on function public.join_store(text, text, text) from public, anon;
revoke execute on function public.my_stores() from public, anon;
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.create_store(text, text, text) to authenticated;
grant execute on function public.join_store(text, text, text) to authenticated;
grant execute on function public.my_stores() to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
alter publication supabase_realtime add table public.records;
