-- A webhook event goes out whoever did the step (2026-11-24).
--
-- Developer → Webhooks offers 31 events. Seven were raised on the event bus;
-- the rest only when a person clicked through the admin, where the browser
-- called send-webhook itself (src/lib/modules/*: triggerWebhook). A page an
-- agent published, a deal moved on the gateway, a company the CRM import made,
-- a subscriber who confirmed by mail — none of them reached a subscriber.
--
-- The rule is the row's now, as for orders and bookings: the table raises the
-- event (emit_platform_event → agent_events → event-dispatcher → send-webhook,
-- signed), and send-webhook leaves a browser call for one of these names to the
-- bus (PLATFORM_RAISED_EVENTS), so nothing is delivered twice.
--
-- Raised here: page.published, blog_post.published, kb_article.published,
-- deal.created, deal.stage_changed, deal.lost, company.created,
-- product.created, newsletter.subscribed, newsletter.unsubscribed,
-- form.submitted. The *.updated / *.deleted / media / global-block events are
-- left to the admin for now: an update fires on every save. No instance on the
-- fleet had a webhook when this was written.

CREATE OR REPLACE FUNCTION public.tg_emit_published_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  became boolean;
  evt text;
BEGIN
  IF TG_TABLE_NAME = 'kb_articles' THEN
    became := COALESCE(NEW.is_published, false)
      AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.is_published, false));
    evt := 'kb_article.published';
  ELSE
    became := NEW.status::text = 'published'
      AND (TG_OP = 'INSERT' OR OLD.status::text IS DISTINCT FROM 'published');
    evt := CASE TG_TABLE_NAME WHEN 'pages' THEN 'page.published' ELSE 'blog_post.published' END;
  END IF;
  IF became THEN
    IF evt = 'page.published' THEN
      PERFORM public.emit_platform_event('page.published',
        jsonb_build_object('id', NEW.id, 'slug', NEW.slug, 'title', NEW.title), 'pages');
    ELSIF evt = 'blog_post.published' THEN
      PERFORM public.emit_platform_event('blog_post.published',
        jsonb_build_object('id', NEW.id, 'slug', NEW.slug, 'title', NEW.title), 'blog');
    ELSE
      PERFORM public.emit_platform_event('kb_article.published',
        jsonb_build_object('id', NEW.id, 'slug', NEW.slug, 'title', NEW.title), 'kb');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_emit_page_published ON public.pages;
CREATE TRIGGER trg_emit_page_published AFTER INSERT OR UPDATE OF status ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_published_events();
DROP TRIGGER IF EXISTS trg_emit_blog_post_published ON public.blog_posts;
CREATE TRIGGER trg_emit_blog_post_published AFTER INSERT OR UPDATE OF status ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_published_events();
DROP TRIGGER IF EXISTS trg_emit_kb_article_published ON public.kb_articles;
CREATE TRIGGER trg_emit_kb_article_published AFTER INSERT OR UPDATE OF is_published ON public.kb_articles
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_published_events();

-- A deal: born, moved, lost. deal.won keeps its own trigger (tg_emit_deal_events).
CREATE OR REPLACE FUNCTION public.tg_emit_deal_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_platform_event('deal.created',
      jsonb_build_object('id', NEW.id, 'lead_id', NEW.lead_id, 'stage', NEW.stage, 'value_cents', NEW.value_cents), 'deals');
  ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
    PERFORM public.emit_platform_event('deal.stage_changed',
      jsonb_build_object('id', NEW.id, 'lead_id', NEW.lead_id, 'from', OLD.stage, 'to', NEW.stage, 'value_cents', NEW.value_cents), 'deals');
    IF NEW.stage::text = 'closed_lost' THEN
      PERFORM public.emit_platform_event('deal.lost',
        jsonb_build_object('id', NEW.id, 'lead_id', NEW.lead_id, 'value_cents', NEW.value_cents), 'deals');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_emit_deal_lifecycle ON public.deals;
CREATE TRIGGER trg_emit_deal_lifecycle AFTER INSERT OR UPDATE OF stage ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_deal_lifecycle();

CREATE OR REPLACE FUNCTION public.tg_emit_record_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF TG_TABLE_NAME = 'companies' THEN
    PERFORM public.emit_platform_event('company.created',
      jsonb_build_object('id', NEW.id, 'name', NEW.name, 'domain', NEW.domain), 'companies');
  ELSIF TG_TABLE_NAME = 'products' THEN
    PERFORM public.emit_platform_event('product.created',
      jsonb_build_object('id', NEW.id, 'name', NEW.name, 'price_cents', NEW.price_cents), 'products');
  ELSIF TG_TABLE_NAME = 'form_submissions' THEN
    PERFORM public.emit_platform_event('form.submitted',
      jsonb_build_object('id', NEW.id, 'form_name', NEW.form_name, 'block_id', NEW.block_id,
                         'page_id', NEW.page_id, 'lead_id', NEW.lead_id), 'forms');
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_emit_company_created ON public.companies;
CREATE TRIGGER trg_emit_company_created AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_record_created();
DROP TRIGGER IF EXISTS trg_emit_product_created ON public.products;
CREATE TRIGGER trg_emit_product_created AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_record_created();
DROP TRIGGER IF EXISTS trg_emit_form_submitted ON public.form_submissions;
CREATE TRIGGER trg_emit_form_submitted AFTER INSERT ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_record_created();

-- A subscriber who confirmed, and one who left.
CREATE OR REPLACE FUNCTION public.tg_emit_newsletter_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed') THEN
    PERFORM public.emit_platform_event('newsletter.subscribed',
      jsonb_build_object('id', NEW.id, 'email', NEW.email, 'name', NEW.name), 'newsletter');
  ELSIF NEW.status = 'unsubscribed' AND TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'unsubscribed' THEN
    PERFORM public.emit_platform_event('newsletter.unsubscribed',
      jsonb_build_object('id', NEW.id, 'email', NEW.email), 'newsletter');
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_emit_newsletter_status ON public.newsletter_subscribers;
CREATE TRIGGER trg_emit_newsletter_status AFTER INSERT OR UPDATE OF status ON public.newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_newsletter_status();

REVOKE ALL ON FUNCTION public.tg_emit_published_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_emit_deal_lifecycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_emit_record_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_emit_newsletter_status() FROM PUBLIC, anon, authenticated;
