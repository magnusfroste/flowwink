/**
 * The native MCP transport answers for THIS caller (2026-11-06). Until today
 * the McpServer was built outside the request context and cached per
 * ?groups= alone for five minutes: every key saw the same tools/list,
 * whatever its peer ceiling, its owner's reach, or the modules switched off
 * meanwhile — and a native tools/call skipped the key-scope and ceiling
 * checks REST ran. Now the handler is built and run under one store, the
 * list is the owner's reach, the cache key is the caller's reach and it
 * lives a minute, and every tool handler runs the same three checks as REST.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const mcp = readFileSync('supabase/functions/mcp-server/index.ts', 'utf8');

describe('the native MCP transport', () => {
  it('builds and runs the handler under one request store that carries the scopes', () => {
    expect(mcp).toMatch(/readOnly\?: boolean; scopes\?: string\[\] \}>\(\);/);
    expect(mcp).toMatch(/\{ callerUserId, callerApiKeyId, peerGroups, ownerUserId, readOnly, scopes, agentName: agentNameOf\(c\) \},\s+async \(\) => \(await getMcpHandler\(filterGroups, openaiSafe, dispatchMode\)\)\(c\.req\.raw\),/);
    // No handler is fetched before the store opens.
    const route = mcp.slice(mcp.indexOf('app.all("/*", async (c) => {'));
    expect(route.indexOf('getMcpHandler(')).toBeGreaterThan(route.indexOf('requestContext.run('));
  });

  it('the tool list is the owner\'s reach and the cache key is the caller\'s reach, one minute', () => {
    expect(mcp).toMatch(/const skills = \(await filterByOwner\(await loadExposedSkills\(filterGroups\), ctx0\?\.ownerUserId\)\)\s+\.filter\(\(s\) => scopeAllowsSkill\(ctx0\?\.scopes, s\.name, s\.category\)\);/);
    expect(mcp).toMatch(/const MCP_HANDLER_TTL_MS = 60 \* 1000;/);
    expect(mcp).toMatch(/const cacheKey = `\$\{groupKey\}::\$\{ceilingKey\}::\$\{scopeKey\}::\$\{ctx\?\.ownerUserId \?\? "-"\}/);
    expect(mcp).not.toMatch(/5 \* 60 \* 1000/);
  });

  it('every native tool handler runs the same checks as REST: scope, ceiling, owner', () => {
    const native = mcp.slice(mcp.indexOf('async function createMcpServer('), mcp.indexOf('// Cache MCP handlers'));
    expect(native).toMatch(/if \(!scopeAllowsSkill\(ctx\?\.scopes, skill\.name, skill\.category\)\s+\|\| !skillWithinGroups\(skill\.name, skill\.handler, skill\.category, ctx\?\.peerGroups\)\) \{/);
    expect(native.indexOf('scopeAllowsSkill(ctx?.scopes')).toBeLessThan(native.indexOf('const reach = await ownerMayRun(skill.name, ctx?.ownerUserId);'));
  });
});
