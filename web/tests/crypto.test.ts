import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generatePairCode,
  generateSecureId,
  hashPassword,
  verifyPassword,
  signAuthToken,
  verifyAuthToken,
  signDeviceToken,
  verifyDeviceToken,
} from '../src/lib/crypto';

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

  it('hashes and securely verifies user passwords', () => {
    const password = 'CorrectHorseBatteryStaple123!';
    const { hash, salt } = hashPassword(password);
    assert.ok(hash);
    assert.ok(salt);

    // Correct password verifies true
    assert.strictEqual(verifyPassword(password, hash, salt), true);

    // Incorrect password verifies false
    assert.strictEqual(verifyPassword('WrongPassword', hash, salt), false);
    assert.strictEqual(verifyPassword('', hash, salt), false);
  });

  it('signs and verifies user auth tokens correctly', () => {
    const userId = 'usr_test_user_99';
    const deviceId = 'dev_test_device_88';
    const token = signAuthToken(userId, deviceId);
    assert.ok(token);

    const verification = verifyAuthToken(token);
    assert.strictEqual(verification.valid, true);
    assert.strictEqual(verification.userId, userId);
    assert.strictEqual(verification.deviceId, deviceId);
  });

  it('signs and verifies device tokens correctly', () => {
    const deviceId = 'dev_1234567890abcdef';
    const token = signDeviceToken(deviceId);
    assert.ok(token);

    const verification = verifyDeviceToken(token);
    assert.strictEqual(verification.valid, true);
    assert.strictEqual(verification.deviceId, deviceId);
  });

  it('rejects tampered tokens', () => {
    const token = signAuthToken('usr_123', 'dev_456');
    const tampered = token.slice(0, -4) + 'zzzz';

    const verification = verifyAuthToken(tampered);
    assert.strictEqual(verification.valid, false);
  });

  it('rejects empty or null tokens', () => {
    assert.strictEqual(verifyAuthToken(null).valid, false);
    assert.strictEqual(verifyAuthToken(undefined).valid, false);
    assert.strictEqual(verifyAuthToken('').valid, false);
  });
});
