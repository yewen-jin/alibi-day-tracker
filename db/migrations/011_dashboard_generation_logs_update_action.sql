alter table dashboard_view_generation_logs
  drop constraint if exists dashboard_view_generation_logs_action_check;

alter table dashboard_view_generation_logs
  add constraint dashboard_view_generation_logs_action_check
  check (action in ('create', 'refresh', 'update'));
