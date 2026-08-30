-- Kundryggraden, steg 10: adressen är en part.
--
-- partners.type byggdes i steg 1 med Odoos fyra värden — contact, invoice,
-- delivery, other — och sedan använde ingenting den. Varje part på varje
-- instans är 'contact'. En död ratt, byggd av mig.
--
-- Samtidigt bär systemet TRE osammanhängande adressrepresentationer:
--   orders            sex platta kolumner (shipping_name, shipping_city, …)
--   quotes            en textklump i customer_address
--   invoices          ingenting alls — fakturan har ingen adress
--   customer_addresses portalens adressbok, hängd på inloggningen
--
-- Odoo lagrar inte adresser på dokumentet. sale.order har partner_id,
-- partner_invoice_id och partner_shipping_id — tre REFERENSER till parter, där
-- de två sista är barnparter med type = invoice respektive delivery. De
-- defaultas från kunden men går att skriva över per order; fakturan tar
-- partner_invoice_id och plocklistan partner_shipping_id.
--
-- Vinsten är inte städning. Det är tre saker vi i dag inte kan uttrycka alls:
--   * fakturera A, leverera till B — vanligt i B2B med central fakturaadress
--   * återanvända adressen mellan köp, i stället för att fråga kunden igen
--   * härleda skatt och fraktzon ur leveransadressen som en RIKTIG post
--
-- De gamla kolumnerna rörs inte. De är vad som faktiskt skickades den dagen —
-- historik, inte dubblett. Odoo hade samma problem och löste det med att
-- dokumentet pekar på parten medan utskriften fryser texten.

-- ── Referenserna på säljkedjan ──────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quotes', 'orders', 'invoices'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format(
      'ALTER TABLE public.%I
         ADD COLUMN IF NOT EXISTS partner_invoice_id  uuid REFERENCES public.partners(id) ON DELETE SET NULL,
         ADD COLUMN IF NOT EXISTS partner_shipping_id uuid REFERENCES public.partners(id) ON DELETE SET NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (partner_invoice_id) WHERE partner_invoice_id IS NOT NULL',
                   t || '_partner_invoice_idx', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (partner_shipping_id) WHERE partner_shipping_id IS NOT NULL',
                   t || '_partner_shipping_idx', t);
    EXECUTE format('COMMENT ON COLUMN public.%I.partner_invoice_id IS %L', t,
      'Fakturaadressen som PART (Odoo partner_invoice_id). Defaultas från kunden, går att skriva över.');
    EXECUTE format('COMMENT ON COLUMN public.%I.partner_shipping_id IS %L', t,
      'Leveransadressen som PART (Odoo partner_shipping_id). Skatt och fraktzon härleds ur den.');
  END LOOP;
END $$;

-- ── address_get: hitta rätt adress för en part ──────────────────────────────
-- Odoos ordning, återgiven: leta NEDÅT bland barnen efter matchande type och
-- stanna vid bolagsgränser, sedan UPPÅT bland förfäderna inom samma
-- kommersiella part, sedan en 'contact'-barnrad, och till sist parten själv.
--
-- Sista fallbacken är det som gör funktionen användbar: ett bolag utan
-- registrerad fakturaadress ÄR sin egen fakturaadress. Inget behöver skapas
-- innan systemet fungerar.
CREATE OR REPLACE FUNCTION public.partner_address(
  p_partner_id uuid,
  p_type       text
) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_commercial uuid;
BEGIN
  IF p_partner_id IS NULL THEN RETURN NULL; END IF;
  IF p_type NOT IN ('invoice', 'delivery', 'other', 'contact') THEN
    RAISE EXCEPTION 'Unknown address type % — Odoo has contact, invoice, delivery, other', p_type;
  END IF;

  -- 1. Ett barn med rätt typ.
  SELECT id INTO v_id FROM partners
   WHERE parent_id = p_partner_id AND type = p_type AND active
   ORDER BY created_at LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- 2. Uppåt, men bara inom samma kommersiella part: en systerkontakts
  --    fakturaadress hör till samma juridiska person, en annan kunds gör det inte.
  SELECT commercial_partner_id INTO v_commercial FROM partners WHERE id = p_partner_id;
  IF v_commercial IS NOT NULL THEN
    SELECT id INTO v_id FROM partners
     WHERE commercial_partner_id = v_commercial AND type = p_type AND active
       AND id <> p_partner_id
     ORDER BY (parent_id = p_partner_id) DESC, created_at LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  -- 3. Parten själv. Ett bolag utan registrerad fakturaadress ÄR sin adress.
  RETURN p_partner_id;
END $$;

REVOKE ALL ON FUNCTION public.partner_address(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_address(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.partner_address(uuid, text) IS
  'Odoos address_get: barn med rätt typ, annars en inom samma kommersiella '
  'part, annars parten själv. Skapar aldrig något.';

-- ── Defaulten på dokumentet ─────────────────────────────────────────────────
-- Kör EFTER documents_resolve_partner (namnet avgör ordningen inom samma
-- händelse, och 'zzz_' garanterar att partner_id hunnit sättas).
CREATE OR REPLACE FUNCTION public.documents_default_addresses()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_commercial uuid; v_addr_commercial uuid;
  v_row jsonb := to_jsonb(NEW);
BEGIN
  IF NEW.partner_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.partner_invoice_id IS NULL THEN
    NEW.partner_invoice_id := public.partner_address(NEW.partner_id, 'invoice');
  END IF;

  IF NEW.partner_shipping_id IS NULL THEN
    -- Bär raden en RIKTIG adress (webbutcheckningens platta kolumner) så är
    -- den adressen svaret — inte parten själv. Annars ignoreras det kunden
    -- faktiskt skrev, och nästa köp får fråga om det igen.
    --
    -- Ordningen spelar roll: default först och migrering sedan gav noll
    -- kandidater, eftersom kolumnen aldrig hann vara NULL. Adressen måste
    -- fångas när raden FÖDS.
    IF v_row ? 'shipping_address_line1'
       AND coalesce(trim(v_row->>'shipping_address_line1'), '') <> '' THEN
      NEW.partner_shipping_id := public.ensure_partner_address(
        NEW.partner_id, 'delivery',
        v_row->>'shipping_name', v_row->>'shipping_address_line1',
        v_row->>'shipping_address_line2', v_row->>'shipping_postal_code',
        v_row->>'shipping_city', v_row->>'shipping_country', v_row->>'shipping_phone');
    END IF;
    IF NEW.partner_shipping_id IS NULL THEN
      NEW.partner_shipping_id := public.partner_address(NEW.partner_id, 'delivery');
    END IF;
  END IF;

  -- Integritet: man fakturerar eller levererar inte till någon ANNAN kunds
  -- adress. Odoo begränsar valet i gränssnittet; vi gör det i databasen, för
  -- en agent som skriver direkt har inget gränssnitt att begränsas av.
  SELECT commercial_partner_id INTO v_commercial FROM partners WHERE id = NEW.partner_id;
  IF NEW.partner_invoice_id IS NOT NULL THEN
    SELECT commercial_partner_id INTO v_addr_commercial FROM partners WHERE id = NEW.partner_invoice_id;
    IF v_addr_commercial IS DISTINCT FROM v_commercial THEN
      RAISE EXCEPTION 'The invoice address belongs to a different customer than the document — an address is not shared across legal entities';
    END IF;
  END IF;
  IF NEW.partner_shipping_id IS NOT NULL THEN
    SELECT commercial_partner_id INTO v_addr_commercial FROM partners WHERE id = NEW.partner_shipping_id;
    IF v_addr_commercial IS DISTINCT FROM v_commercial THEN
      RAISE EXCEPTION 'The delivery address belongs to a different customer than the document — an address is not shared across legal entities';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quotes', 'orders', 'invoices'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'zzz_' || t || '_addresses', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.documents_default_addresses()',
      'zzz_' || t || '_addresses', t);
  END LOOP;
END $$;

-- ── Skapa en adresspart ur riktiga fält ────────────────────────────────────
-- Enda vägen som SKAPAR en adresspart. Idempotent på (förälder, typ,
-- normaliserad adressrad + postnummer): samma adress två gånger ger en rad.
CREATE OR REPLACE FUNCTION public.ensure_partner_address(
  p_parent_id    uuid,
  p_type         text,
  p_name         text DEFAULT NULL,
  p_street       text DEFAULT NULL,
  p_street2      text DEFAULT NULL,
  p_postal_code  text DEFAULT NULL,
  p_city         text DEFAULT NULL,
  p_country_code text DEFAULT NULL,
  p_phone        text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_key text;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR can_access_module(auth.uid(), 'leads')
          OR can_access_module(auth.uid(), 'companies')) THEN
    RAISE EXCEPTION 'Forbidden: creating a partner address requires the leads or companies module';
  END IF;
  IF p_parent_id IS NULL THEN RETURN NULL; END IF;
  IF p_type NOT IN ('invoice', 'delivery', 'other') THEN
    RAISE EXCEPTION 'An address child must be invoice, delivery or other — not %', p_type;
  END IF;

  -- Utan gata finns ingen adress. En rad med bara ett namn är inte en adress,
  -- den är en dubblett av parten.
  v_key := lower(trim(coalesce(p_street, '')) || '|' || trim(coalesce(p_postal_code, '')));
  IF v_key = '|' THEN RETURN NULL; END IF;

  SELECT id INTO v_id FROM partners
   WHERE parent_id = p_parent_id AND type = p_type AND active
     AND lower(trim(coalesce(street, '')) || '|' || trim(coalesce(postal_code, ''))) = v_key
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO partners (name, is_company, type, parent_id, street, street2,
                        postal_code, city, country_code, phone)
  VALUES (coalesce(nullif(trim(p_name), ''),
                   (SELECT name FROM partners WHERE id = p_parent_id)),
          false, p_type, p_parent_id, p_street, p_street2,
          p_postal_code, p_city, p_country_code, p_phone)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.ensure_partner_address(uuid, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_partner_address(uuid, text, text, text, text, text, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.ensure_partner_address(uuid, text, text, text, text, text, text, text, text) IS
  'Skapar (eller återanvänder) en adresspart under en part. Idempotent på gata '
  '+ postnummer. Returnerar NULL för en adress utan gata — en rad med bara ett '
  'namn är ingen adress.';

-- ── Migrering: de platta orderadresserna blir barnparter ────────────────────
-- Kolumnerna töms INTE. De är vad som faktiskt skickades den dagen; parten är
-- vad vi vet i dag. Att radera historiken för att den nu finns strukturerad
-- vore att byta ett faktum mot en tolkning.
CREATE OR REPLACE FUNCTION public.migrate_order_addresses(
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_candidates int; v_made int := 0; v_linked int := 0;
  r record; v_addr uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: migrating order addresses requires the admin role';
  END IF;

  SELECT count(*) INTO v_candidates FROM orders o
   WHERE o.partner_id IS NOT NULL AND o.partner_shipping_id IS NULL
     AND coalesce(trim(o.shipping_address_line1), '') <> '';

  IF NOT p_dry_run THEN
    FOR r IN SELECT o.id, o.partner_id, o.shipping_name, o.shipping_address_line1,
                    o.shipping_address_line2, o.shipping_postal_code, o.shipping_city,
                    o.shipping_country, o.shipping_phone
               FROM orders o
              WHERE o.partner_id IS NOT NULL AND o.partner_shipping_id IS NULL
                AND coalesce(trim(o.shipping_address_line1), '') <> ''
    LOOP
      v_addr := public.ensure_partner_address(
        r.partner_id, 'delivery', r.shipping_name, r.shipping_address_line1,
        r.shipping_address_line2, r.shipping_postal_code, r.shipping_city,
        r.shipping_country, r.shipping_phone);
      IF v_addr IS NOT NULL THEN
        UPDATE orders SET partner_shipping_id = v_addr WHERE id = r.id;
        v_linked := v_linked + 1;
      END IF;
    END LOOP;
    SELECT count(*) INTO v_made FROM partners WHERE type = 'delivery';
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'orders_with_a_flat_address', v_candidates,
    'orders_linked', v_linked,
    'delivery_addresses_now', v_made,
    'note', 'The shipping_* columns are left untouched: they are what was actually '
         || 'shipped that day. The party is what we know today.');
END $$;

REVOKE ALL ON FUNCTION public.migrate_order_addresses(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.migrate_order_addresses(boolean) TO authenticated, service_role;

-- ── Portalens adressbok viker in ───────────────────────────────────────────
-- customer_addresses hänger på user_id, alltså på inloggningen — inte på
-- parten. Samma dialektsplittring som kunden hade. Vi migrerar dem till
-- barnparter när användarens part går att hitta, och rapporterar resten.
CREATE OR REPLACE FUNCTION public.migrate_customer_addresses(
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total int; v_resolvable int; v_made int := 0;
  r record; v_partner uuid; v_addr uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: migrating customer addresses requires the admin role';
  END IF;
  IF to_regclass('public.customer_addresses') IS NULL THEN
    RETURN jsonb_build_object('skipped', 'no customer_addresses table on this instance');
  END IF;

  SELECT count(*) INTO v_total FROM customer_addresses;
  SELECT count(*) INTO v_resolvable
    FROM customer_addresses ca
    JOIN auth.users u ON u.id = ca.user_id
    JOIN partners p ON lower(p.email) = lower(u.email);

  IF NOT p_dry_run THEN
    FOR r IN SELECT ca.*, u.email AS login_email
               FROM customer_addresses ca
               JOIN auth.users u ON u.id = ca.user_id
    LOOP
      SELECT id INTO v_partner FROM partners
       WHERE lower(email) = lower(r.login_email) AND active
       ORDER BY is_company ASC, created_at ASC LIMIT 1;
      CONTINUE WHEN v_partner IS NULL;

      v_addr := public.ensure_partner_address(
        v_partner, 'delivery', r.full_name, r.address_line1, r.address_line2,
        r.postal_code, r.city, r.country, r.phone);
      IF v_addr IS NOT NULL THEN v_made := v_made + 1; END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'address_book_rows', v_total,
    'resolvable_to_a_party', v_resolvable,
    'addresses_created', v_made,
    'note', 'Rows whose login has no party are left alone — the address book is '
         || 'keyed on the login, and a login without a party is a person we have '
         || 'never done business with.');
END $$;

REVOKE ALL ON FUNCTION public.migrate_customer_addresses(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.migrate_customer_addresses(boolean) TO authenticated, service_role;
