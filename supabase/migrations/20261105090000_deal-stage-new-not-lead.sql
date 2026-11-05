-- A deal's first stage is "New", not "Lead" (Peter at optic, 2026-11-05).
--
-- Two axes shared one word. A CONTACT has a lifecycle (prospect → lead →
-- opportunity → customer → lost): where the person stands with us — the
-- HubSpot/Salesforce word, kept. A DEAL has a pipeline stage (lead →
-- prospecting → … → closed_won): how far one concrete piece of business has
-- come. A deal that exists already has a value and an expected close, so its
-- contact is by definition past "lead"; the first column means "new, not yet
-- qualified" — Odoo's "New", and what our own Odoo import relabels it to
-- ("Nytt"). Calling that column "Lead" made the two axes read as one.
--
-- The key `lead` is wire (deal_stage enum, triggers, import mapping, deployed
-- per instance) and stays. Only the seeded NAME changes:
--   * the seed function now births the stage as "New";
--   * an instance still carrying the seed's own "Lead" is renamed — an
--     operator who named the column themselves (anything but "Lead") is
--     left alone, the same rule the seed itself follows.
-- The contact lifecycle row ('lead','lead','Lead') is untouched.

CREATE OR REPLACE FUNCTION public.seed_default_pipeline_stages()
RETURNS TABLE(inserted integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_count integer;
BEGIN
  WITH defaults(entity_type, key, name, sort_order, probability, is_won, is_lost, fold) AS (
    VALUES
      ('deal','lead','New',10,10::numeric,false,false,false),
      ('deal','prospecting','Prospecting',20,20::numeric,false,false,false),
      ('deal','qualified','Qualified',30,40::numeric,false,false,false),
      ('deal','proposal','Proposal',40,60::numeric,false,false,false),
      ('deal','negotiation','Negotiation',50,80::numeric,false,false,false),
      ('deal','closed_won','Closed Won',60,100::numeric,true,false,false),
      ('deal','closed_lost','Closed Lost',70,0::numeric,false,true,true),
      ('lead','lead','Lead',10,10::numeric,false,false,false),
      ('lead','opportunity','Opportunity',20,40::numeric,false,false,false),
      ('lead','customer','Customer',30,100::numeric,true,false,false),
      ('lead','lost','Lost',40,0::numeric,false,true,true),
      ('ticket','new','New',10,NULL::numeric,false,false,false),
      ('ticket','open','Open',20,NULL::numeric,false,false,false),
      ('ticket','in_progress','In Progress',30,NULL::numeric,false,false,false),
      ('ticket','waiting','Waiting',40,NULL::numeric,false,false,false),
      ('ticket','resolved','Resolved',50,NULL::numeric,true,false,true),
      ('ticket','closed','Closed',60,NULL::numeric,true,false,true)
  )
  INSERT INTO public.pipeline_stages (entity_type, key, name, sort_order, probability, is_won, is_lost, fold)
  SELECT d.entity_type, d.key, d.name, d.sort_order, d.probability, d.is_won, d.is_lost, d.fold
  FROM defaults d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.pipeline_stages p
     WHERE p.entity_type = d.entity_type AND p.key = d.key
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_default_pipeline_stages() TO service_role;

-- Rename only the seed's own word; a column the operator named stays.
UPDATE public.pipeline_stages
   SET name = 'New'
 WHERE entity_type = 'deal' AND key = 'lead' AND name = 'Lead';

SELECT public.seed_default_pipeline_stages();
