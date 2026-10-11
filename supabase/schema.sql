-- Run this whole file once in Supabase > SQL Editor.
create table profiles(id uuid primary key references auth.users on delete cascade, name text not null);
create table workspaces(id uuid primary key default gen_random_uuid(), name text not null check (length(name) between 1 and 60), code text unique not null, owner uuid not null references auth.users, created_at timestamptz default now());
create table members(workspace_id uuid references workspaces on delete cascade, user_id uuid references profiles on delete cascade, primary key(workspace_id,user_id));
create table messages(id bigserial primary key, workspace_id uuid references workspaces on delete cascade, user_id uuid references auth.users, name text, body text not null check (length(body)<=2000), created_at timestamptz default now());
create table docs(id uuid primary key default gen_random_uuid(), workspace_id uuid references workspaces on delete cascade, title text not null, course text not null default 'General', path text not null, created_by uuid references auth.users, created_at timestamptz default now());
create table ai_chats(id bigserial primary key, workspace_id uuid references workspaces on delete cascade, user_id uuid references auth.users, role text check (role in ('user','model')), content text not null, created_at timestamptz default now());
alter table profiles enable row level security; alter table workspaces enable row level security; alter table members enable row level security;
alter table messages enable row level security; alter table docs enable row level security; alter table ai_chats enable row level security;

create function public.is_member(w uuid) returns boolean language sql security definer set search_path=public stable as
$$ select exists(select 1 from members where workspace_id=w and user_id=auth.uid()) $$;

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as
$$ begin insert into profiles(id,name) values(new.id, coalesce(nullif(left(new.raw_user_meta_data->>'name',40),''),'Student')); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.create_workspace(n text) returns uuid language plpgsql security definer set search_path=public as
$$ declare w uuid; begin
 insert into workspaces(name,code,owner) values(left(trim(n),60), upper(substr(md5(random()::text||clock_timestamp()::text),1,8)), auth.uid()) returning id into w;
 insert into members values(w,auth.uid()); return w; end $$;
create function public.join_workspace(c text) returns uuid language plpgsql security definer set search_path=public as
$$ declare w uuid; begin
 select id into w from workspaces where code=upper(trim(c));
 if w is null then raise exception 'That code is not valid'; end if;
 insert into members values(w,auth.uid()) on conflict do nothing; return w; end $$;

create policy "profiles read" on profiles for select to authenticated using (true);
create policy "workspaces read" on workspaces for select to authenticated using (is_member(id));
create policy "members read" on members for select to authenticated using (is_member(workspace_id));
create policy "messages read" on messages for select to authenticated using (is_member(workspace_id));
create policy "messages write" on messages for insert to authenticated with check (is_member(workspace_id) and user_id=auth.uid());
create policy "docs read" on docs for select to authenticated using (is_member(workspace_id));
create policy "docs write" on docs for insert to authenticated with check (is_member(workspace_id) and created_by=auth.uid());
create policy "docs delete" on docs for delete to authenticated using (created_by=auth.uid());
create policy "ai read" on ai_chats for select to authenticated using (user_id=auth.uid() and is_member(workspace_id));
create policy "ai write" on ai_chats for insert to authenticated with check (user_id=auth.uid() and is_member(workspace_id));

alter publication supabase_realtime add table messages;
insert into storage.buckets(id,name,public) values('slides','slides',false);
create policy "slides read" on storage.objects for select to authenticated using (bucket_id='slides' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "slides write" on storage.objects for insert to authenticated with check (bucket_id='slides' and public.is_member(((storage.foldername(name))[1])::uuid));
