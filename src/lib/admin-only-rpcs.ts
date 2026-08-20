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
  disable_demo_cycle_cron: 'Plattformens cron-schema, inte en modulyta.',
  run_period_lock_tests: 'Testhärnesk för periodlåsen — plattformsverktyg.',
  instance_sync_status: 'Driftstatus för instansen (fyra lager). Plattformsyta.',

  // ── Matrisen kan inte grinda sig själv ───────────────────────────────────
  // En roll som fick sin modul via matrisen får inte kunna skriva om matrisen.
  reset_role_module_access: 'Skriver om matrisen. Får aldrig grindas AV matrisen.',
  reset_all_role_module_access: 'Skriver om matrisen. Får aldrig grindas AV matrisen.',

  // ── Räckvidd över alla moduler ───────────────────────────────────────────
  global_search: 'Söker tvärs ALLA moduler. En modulgrind vore fel dimension.',

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

  // ── Ägarmodulen saknar matrisratt ────────────────────────────────────────
  // `email` är core:true i useModules, och RolePermissionsPage listar bara
  // `!cfg.core`. can_access_module(uid,'email') vore därför admin-only för
  // alltid — en konvertering hade SNÄVAT dagens vakt (admin|marketing|sales|
  // support) till admin. ÖPPET: ge email en matrisratt, konvertera sedan.
  add_email_suppression: 'Ägarmodul `email` är core — ingen matrisratt att peka på ännu.',
  remove_email_suppression: 'Ägarmodul `email` är core — ingen matrisratt att peka på ännu.',
  upsert_email_template: 'Ägarmodul `email` är core — ingen matrisratt att peka på ännu.',
  delete_email_template: 'Ägarmodul `email` är core — ingen matrisratt att peka på ännu.',
};
