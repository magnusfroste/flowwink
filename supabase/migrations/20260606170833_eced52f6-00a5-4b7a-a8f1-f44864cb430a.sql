
drop function if exists public.ensure_consultant_reindex_cron(text, text, text);
drop function if exists public.consultant_reindex_cron_status();

do $$
begin
  perform cron.unschedule('reindex-consultant-embeddings');
exception when others then null;
end $$;
