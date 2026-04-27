import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const moduleSource = fs.readFileSync(
  path.join(projectRoot, 'src/lib/modules/federation-module.ts'),
  'utf8',
);

function extractSkillSeed(name: string): string | null {
  const re = new RegExp(`\\{[^}]*name:\\s*'${name}'[\\s\\S]*?\\n\\s{2}\\}`);
  const m = moduleSource.match(re);
  return m ? m[0] : null;
}

describe('federation module — invite_peer_agent skill', () => {
  const seed = extractSkillSeed('invite_peer_agent');

  it('seed-block exists in FEDERATION_SKILLS', () => {
    expect(seed).not.toBeNull();
  });

  it('uses the federation-invite-peer edge handler', () => {
    expect(seed).toMatch(/handler:\s*'edge:federation-invite-peer'/);
  });

  it('is exposed externally (scope: external)', () => {
    expect(seed).toMatch(/scope:\s*'external'/);
  });

  it('declares invitee_name as required parameter', () => {
    expect(seed).toMatch(/required:\s*\['invitee_name'\]/);
  });

  it('exposes a tool_definition with the same name', () => {
    expect(seed).toMatch(/name:\s*'invite_peer_agent'[\s\S]*tool_definition/);
  });

  it('is registered in the federation module skills array', () => {
    const skillsBlock = moduleSource.match(/skills:\s*\[([\s\S]*?)\]/);
    expect(skillsBlock).not.toBeNull();
    expect(skillsBlock![1]).toContain("'invite_peer_agent'");
  });

  it('describes transitive trust model in instructions', () => {
    expect(seed).toMatch(/transitive/i);
    expect(seed).toMatch(/toolset_groups/);
  });
});

describe('federation-invite-peer edge function', () => {
  const fnPath = path.join(projectRoot, 'supabase/functions/federation-invite-peer/index.ts');

  it('edge function file exists', () => {
    expect(fs.existsSync(fnPath)).toBe(true);
  });

  it('resolves inviter via caller_api_key_id (agent-execute injection)', () => {
    const src = fs.readFileSync(fnPath, 'utf8');
    expect(src).toMatch(/caller_api_key_id|_caller_api_key_id/);
  });

  it('writes audit row to peer_invitations', () => {
    const src = fs.readFileSync(fnPath, 'utf8');
    expect(src).toMatch(/peer_invitations/);
  });
});
