INSERT INTO public.site_settings (key, value)
VALUES (
  'integrations',
  '{
    "email": {
      "config": {
        "provider": "resend",
        "fromEmail": "onboarding@resend.dev",
        "fromName": "FlowWink"
      }
    },
    "resend": {
      "enabled": true,
      "config": {
        "emailConfig": {
          "fromEmail": "onboarding@resend.dev",
          "fromName": "FlowWink"
        },
        "newsletterTracking": {
          "enableOpenTracking": false,
          "enableClickTracking": false
        }
      }
    }
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET value = public.site_settings.value
         || jsonb_build_object(
              'email', jsonb_build_object(
                'config', jsonb_build_object(
                  'provider', 'resend',
                  'fromEmail', 'onboarding@resend.dev',
                  'fromName', 'FlowWink'
                )
              )
            )
         || jsonb_build_object(
              'resend', COALESCE(public.site_settings.value->'resend', '{}'::jsonb)
                      || jsonb_build_object(
                           'enabled', true,
                           'config', COALESCE(public.site_settings.value->'resend'->'config', '{}'::jsonb)
                                   || jsonb_build_object(
                                        'emailConfig', jsonb_build_object(
                                          'fromEmail', 'onboarding@resend.dev',
                                          'fromName', 'FlowWink'
                                        )
                                      )
                         )
            );