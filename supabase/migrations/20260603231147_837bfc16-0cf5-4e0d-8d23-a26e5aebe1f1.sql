
do $$
begin
  perform cron.unschedule('reindex-consultant-embeddings');
exception when others then null;
end $$;

select cron.schedule(
  'reindex-consultant-embeddings',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url := 'https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/resume-match',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('action', 'reindex_stale', 'limit', 25)
  );
  $cron$
);
