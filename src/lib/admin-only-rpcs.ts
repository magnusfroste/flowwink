/**
 * RPC:er som frontend anropar direkt och som medvetet INTE följer matrisen.
 *
 * Rollsvepets tredje varv fann klassen: SECURITY DEFINER-funktioner vars vakt
 * är en hårdkodad rollista (`has_role(auth.uid(),'admin') OR
 * has_role(auth.uid(),'writer') …`) i stället för `can_access_module()`.
 * Vakten sitter i funktionskroppen, så inget pg_policy-svep ser den, och
 * agent-rälsen träffar den aldrig (agent-execute enforcar matrisen själv innan
 * RPC:n körs). Men `supabase.rpc()` går rakt in i funktionen — det är den
 * obevakade dörren.
 *
 * 118 av dem konverterades i 20260821010000. De som står kvar här står kvar
 * MED SKÄL, ett per rad. Listan är inte en parkeringsplats: guardrail-testet
 * `frontend-rpcs-follow-the-matrix.guardrails.test.ts` kräver att varje
 * kvarvarande has_role-vaktad frontend-RPC finns här, OCH att varje post här
 * fortfarande är frontend-anropad och fortfarande has_role-vaktad. Konverterar
 * någon en av dem senare måste raden bort — annars faller testet.
 *
 * Enda konsumenten är guardrail-testet. Detta är en policyförteckning, inte
 * runtime-kod: den auktoriserar ingenting, den PINNAR ett beslut.
 */
export const ADMIN_ONLY_RPCS: Readonly<Record<string, string>> = {
  // ── Danger zone: destruktiva plattformsoperationer ───────────────────────
  // Gaterna ÄR produkten här (samma resonemang som reset_sandbox-klassen).
  // En modulbeviljad roll ska aldrig kunna radera en annan moduls data.
  admin_wipe_journal: 'Raderar huvudboken. Destruktiv plattformsoperation.',
  reset_site_data: 'Wipe av hela siten. Destruktiv plattformsoperation.',
  reset_module_data: 'Wipe per modul — kräver överblick över alla moduler, inte en.',
  seed_module_demo: 'Skriver demodata över skarpa tabeller.',
  enable_demo_cycle_cron: 'Plattformens cron-schema, inte en modulyta.',
  // ── Cron-schemaläggning: schemalägger godtycklig net.http_post (SSRF-yta) ──
  // Fick intern admin-vakt i 20260822040000 (var vaktlös → anon-körbar). Rätt
  // dimension är admin, inte modul: att schemalägga jobb är en plattforms-
  // operation, och bootstrap-vägen (module-bootstrap.ts) körs av admin.
  // Bara flowpilot-cron anropas från frontend (module-bootstrap); de övriga
  // schemaläggarna körs via service_role från edge och står därför INTE här —
  // guardrailen listar bara frontend-anropade RPC:er.
  register_flowpilot_cron: 'Schemalägger cron (net.http_post). Admin, inte modul.',
  // Skriver site_settings.modules — vilka moduler som ÖVER HUVUD TAGET finns.
  // Får aldrig grindas AV matrisen: den som saknar en modul måste ändå kunna
  // föda raden som gör modulen synlig för servern. Admin är rätt dimension.
  ensure_modules_settings: 'Sår modulraden (plattformskonfig). Får aldrig grindas av matrisen den föder.',
  disable_demo_cycle_cron: 'Plattformens cron-schema, inte en modulyta.',
  run_period_lock_tests: 'Testhärnesk för periodlåsen — plattformsverktyg.',
  instance_sync_status: 'Driftstatus för instansen (fyra lager). Plattformsyta.',
  // Läser cron.job + net._http_response för hela instansen — schemat är
  // plattformsnivå, inte en modulyta, och rapporten avslöjar vilka jobb som
  // pekar på en ANNAN instans. Samma dimension som register_flowpilot_cron
  // ovan: den som får schemalägga jobb får läsa schemat.
  cron_health_report: 'Läser instansens cron-schema och HTTP-fel. Plattformsyta, inte modul.',
  // Kvitterar integrationshälsa-notiser i site_settings.integration_health.
  // Integrationer är plattformskonfiguration — det finns ingen modulratt att
  // grinda på, och tillståndet spänner över varje modul som skickar mail,
  // söker på webben eller ringer en AI-provider. Samma dimension som
  // instance_sync_status och cron_health_report ovan: System-ytan är admin.
  acknowledge_integration_health:
    'Kvitterar integrationshälsa-notiser (System → Observability). Plattformsyta, inte modul.',

  // ── Matrisen kan inte grinda sig själv ───────────────────────────────────
  // En roll som fick sin modul via matrisen får inte kunna skriva om matrisen.
  reset_role_module_access: 'Skriver om matrisen. Får aldrig grindas AV matrisen.',
  reset_all_role_module_access: 'Skriver om matrisen. Får aldrig grindas AV matrisen.',

  // ── Vakten är inte en rollista — den är dynamisk eller ägarskapsbaserad ──
  // has_role() förekommer i kroppen, men med en VARIABEL roll ur datan
  // (approval-kedjans egna required_role) eller bara som admin-override på en
  // ägarskapsvakt. Det är inte klassen; att byta ut dem vore att ta bort en
  // funktion, inte en relik.
  advance_approval_step: 'has_role(actor, v_step.required_role) — kedjans egen roll, ur datan.',
  resolve_approval: 'has_role(uid, v_request.required_role) — förfrågans egen roll, ur datan.',
  update_cowork_document_extraction:
    'Ägarvakt (v_owner = v_uid) med admin-override. Modulgrind vore fel dial.',
  log_indirect_time: 'Vakten släpper redan in varje inloggad (auth.uid() IS NOT NULL).',

  // ── Destruktiv grind ─────────────────────────────────────────────────────
  // Suppressions/mall-upsert följer numera matrisratten `email` (roleGatable,
  // 20260821090000) — men mall-DELETE är destruktivt och förblir admin, samma
  // klass som deals DELETE.
  delete_email_template: 'Destruktiv grind — mallradering är admin-only med avsikt.',
};
