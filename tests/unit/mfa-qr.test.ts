import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { operatorTotp } from '../../src/lib/mfa';
describe('private local MFA QR CLI', () => {
  it('writes a local PNG exclusively and refuses to overwrite it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdh-qr-test-'));
    const input = path.join(dir, 'enrollment.txt');
    const output = path.join(dir, 'enrollment.png');
    try {
      fs.writeFileSync(input, operatorTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 'synthetic@example.invalid').toString(), { mode: 0o600 });
      const run = () => spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/mfa-qr.ts'], { encoding: 'utf8', env: { ...process.env, MFA_ENROLLMENT_FILE: input, MFA_QR_FILE: output } });
      const first = run();
      expect(first.status, first.stderr).toBe(0);
      const png = fs.readFileSync(output);
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(first.stdout).not.toContain('otpauth:');
      expect(run().status).toBe(1);
      expect(fs.readFileSync(output)).toEqual(png);
    } finally {
      for (const file of [input, output]) if (fs.existsSync(file)) fs.unlinkSync(file);
      fs.rmdirSync(dir);
    }
  });
});
