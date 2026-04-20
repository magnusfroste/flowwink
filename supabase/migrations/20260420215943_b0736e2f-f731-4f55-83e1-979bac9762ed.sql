UPDATE public.site_settings
SET value = value
  || jsonb_build_object(
       'email', jsonb_build_object(
         'config', jsonb_build_object(
           'provider', 'resend',
           'fromEmail', 'noreply@news.flowwink.com',
           'fromName', 'FlowWink'
         )
       )
     )
  || jsonb_build_object(
       'resend', COALESCE(value->'resend', '{}'::jsonb)
         || jsonb_build_object(
              'enabled', true,
              'config', COALESCE(value->'resend'->'config', '{}'::jsonb)
                || jsonb_build_object(
                     'emailConfig', jsonb_build_object(
                       'fromEmail', 'noreply@news.flowwink.com',
                       'fromName', 'FlowWink'
                     )
                   )
            )
     )
WHERE key = 'integrations';