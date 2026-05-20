-- Add database-backed admin authorization metadata.
-- Promote known admins manually, for example:
-- update app_users set role = 'superadmin' where email = 'admin@example.com';

alter table app_users
  add column if not exists role text not null default 'user';

update app_users
set role = 'user'
where role is null or role not in ('user', 'superadmin');

alter table app_users
  alter column role set default 'user',
  alter column role set not null;

alter table app_users
  drop constraint if exists app_users_role_check;

alter table app_users
  add constraint app_users_role_check
  check (role in ('user', 'superadmin'));
