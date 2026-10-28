-- Sendfile tables only. Existing application tables are left untouched.
begin;
create table public.sendfile_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table public.sendfile_customers (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(name) between 1 and 120),
 code text not null unique check (code ~ '^[A-Za-z0-9_-]{1,30}$'),
 drive_folder_id text not null unique,
 created_at timestamptz not null default now()
);
create table public.sendfile_links (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.sendfile_customers(id),
 token_hash text not null unique,
 expires_at timestamptz not null,
 revoked_at timestamptz,
 reserved_bytes bigint not null default 0,
 reserved_count integer not null default 0,
 created_at timestamptz not null default now()
);
create index sendfile_links_customer_idx on public.sendfile_links(customer_id);
create table public.sendfile_documents (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.sendfile_customers(id),
 link_id uuid not null references public.sendfile_links(id),
 original_name text not null check (length(original_name) between 1 and 240),
 size_bytes bigint not null check (size_bytes between 1 and 20971520),
 mime_type text not null,
 period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 category text not null,
 note text not null default '' check (length(note) <= 1000),
 status text not null default 'pending' check (status in ('pending','completed')),
 drive_file_id text not null unique,
 completed_at timestamptz,
 created_at timestamptz not null default now()
);
create index sendfile_documents_customer_idx on public.sendfile_documents(customer_id);
create index sendfile_documents_link_idx on public.sendfile_documents(link_id);
alter table public.sendfile_admins enable row level security;
alter table public.sendfile_customers enable row level security;
alter table public.sendfile_links enable row level security;
alter table public.sendfile_documents enable row level security;
-- No browser access: all reads/writes pass through the authenticated Edge Function.
revoke all on public.sendfile_admins,public.sendfile_customers,public.sendfile_links,public.sendfile_documents from anon,authenticated;
grant select,insert,update,delete on public.sendfile_admins,public.sendfile_customers,public.sendfile_links,public.sendfile_documents to service_role;

-- Called only by the server after hashing and validating the upload capability.
-- Row locking makes quotas safe under simultaneous uploads.
create function public.sendfile_reserve_upload(p_hash text,p_name text,p_size bigint,p_mime text,p_period text,p_category text,p_note text,p_drive_id text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare l public.sendfile_links; doc_id uuid;
begin
 select * into l from public.sendfile_links where token_hash=p_hash for update;
 if not found or l.revoked_at is not null or l.expires_at <= now() then
  raise exception 'ลิงก์หมดอายุหรือถูกปิดแล้ว';
 end if;
 if p_size < 1 or p_size > 20971520 or l.reserved_count >= 200 or l.reserved_bytes+p_size > 209715200 then
  raise exception 'ไฟล์หรือลิงก์นี้เกินโควตา กรุณาติดต่อผู้ดูแล';
 end if;
 insert into public.sendfile_documents(customer_id,link_id,original_name,size_bytes,mime_type,period,category,note,drive_file_id)
 values(l.customer_id,l.id,p_name,p_size,p_mime,p_period,p_category,p_note,p_drive_id) returning id into doc_id;
 update public.sendfile_links set reserved_bytes=reserved_bytes+p_size,reserved_count=reserved_count+1 where id=l.id;
 return doc_id;
end $$;
revoke all on function public.sendfile_reserve_upload(text,text,bigint,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.sendfile_reserve_upload(text,text,bigint,text,text,text,text,text) to service_role;
commit;
