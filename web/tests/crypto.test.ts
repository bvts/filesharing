import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generatePairCode, generateSecureId, signDeviceToken, verifyDeviceToken } from '../src/lib/crypto';

describe('Crypto & Token Suite', () => {
  it('generates a 6-digit numeric pair code', () => {
    const code = generatePairCode();
    assert.strictEqual(code.length, 6);
    assert.match(code, /^\d{6}$/);
  });

  it('generates secure random IDs with prefixes', () => {
    const id = generateSecureId('dev');
    assert.ok(id.startsWith('dev_'));
    assert.strictEqual(id.length, 4 + 32);
  });

  it('signs and verifies device tokens correctly', () => {
    const deviceId = 'dev_1234567890abcdef';
    const token = signDeviceToken(deviceId);
    assert.ok(token);

    const verification = verifyDeviceToken(token);
    assert.strictEqual(verification.valid, true);
    assert.strictEqual(verification.deviceId, deviceId);
  });

  it('rejects tampered device tokens', () => {
    const deviceId = 'dev_1234567890abcdef';
    const token = signDeviceToken(deviceId);
    const tampered = token.slice(0, -4) + 'zzzz';

    const verification = verifyDeviceToken(tampered);
    assert.strictEqual(verification.valid, false);
  });

  it('rejects empty or null tokens', () => {
    assert.strictEqual(verifyDeviceToken(null).valid, false);
    assert.strictEqual(verifyDeviceToken(undefined).valid, false);
    assert.strictEqual(verifyDeviceToken('').valid, false);
  });
});
