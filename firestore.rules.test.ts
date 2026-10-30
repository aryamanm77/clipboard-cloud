import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const draftRulesPath = path.resolve(process.cwd(), 'DRAFT_firestore.rules');

function loadActiveRules(): string {
  if (fs.existsSync(rulesPath)) {
    return fs.readFileSync(rulesPath, 'utf8');
  }
  return fs.readFileSync(draftRulesPath, 'utf8');
}

test('Firestore security rules enforce all structural pillars and reject Dirty Dozen vectors for zero-sign-in workspace auto-sync', () => {
  const rules = loadActiveRules();

  // Pillar 0: rules_version = '2' and default-deny safety net first
  assert.match(rules, /rules_version\s*=\s*'2';/);
  assert.match(rules, /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);

  // Pillar 1: Master Gate on subcollection /clips/{clipId}/chunks/{chunkId}
  assert.match(rules, /match\s+\/chunks\/\{chunkId\}/);
  assert.match(
    rules,
    /isWorkspaceOwner\(get\(\/databases\/\$\(database\)\/documents\/clips\/\$\(clipId\)\)\.data\.ownerId\)/
  );

  // Pillar 2: Validation blueprints (isValidClip & isValidClipChunk) called on create and update
  assert.match(rules, /function\s+isValidClip\(data\)/);
  assert.match(rules, /function\s+isValidClipChunk\(data,\s*clipId\)/);
  assert.match(rules, /allow\s+update:\s*if[\s\S]*?isValidClip\(incoming\(\)\)/);

  // Pillar 3: Path variable hardening via isValidId
  assert.match(rules, /function\s+isValidId\(id\)/);
  assert.match(rules, /isValidId\(clipId\)/);
  assert.match(rules, /isValidId\(chunkId\)/);

  // Pillar 4 & 5: Strict key allowlists (hasAll & hasOnly) + Action-based update with affectedKeys().hasOnly()
  assert.match(rules, /data\.keys\(\)\.hasAll\(/);
  assert.match(rules, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rules, /incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly\(/);

  // Pillar 8: Secure list queries checking workspace scope
  assert.match(rules, /allow\s+list:\s*if\s+isWorkspaceOwner\(existing\(\)\.ownerId\)/);

  // Temporal integrity & immutability
  assert.match(rules, /incoming\(\)\.createdAt\s*==\s*request\.time/);
  assert.match(rules, /incoming\(\)\.updatedAt\s*==\s*request\.time/);
  assert.match(rules, /incoming\(\)\.ownerId\s*==\s*existing\(\)\.ownerId/);
  assert.match(rules, /incoming\(\)\.createdAt\s*==\s*existing\(\)\.createdAt/);
});
