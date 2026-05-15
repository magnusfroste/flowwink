
CREATE OR REPLACE FUNCTION public.unsubscribe_newsletter_by_email(p_email text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.newsletter_subscribers
  SET status = 'unsubscribed', unsubscribed_at = now()
  WHERE lower(email) = lower(p_email) AND p_email IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END $$;
GRANT EXECUTE ON FUNCTION public.unsubscribe_newsletter_by_email(text) TO anon, authenticated;
