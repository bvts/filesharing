import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  registerPairCode,
  consumePairCode,
  addTransfer,
  getTransfer,
  deleteTransfer,
  cleanupExpiredTransfers,
  getTransfersForDevice,
} from '../src/lib/metadata';

describe('Transfer Lifecycle & Expiration Suite', () => {
  it('registers and consumes a pairing code once', async () => {
    const code = '789123';
    const deviceId = 'dev_test_phone_001';

    await registerPairCode(code, deviceId, 60);
    const consumedFirst = await consumePairCode(code);
    assert.strictEqual(consumedFirst, deviceId);

    // Second consumption must fail (single-use)
    const consumedSecond = await consumePairCode(code);
    assert.strictEqual(consumedSecond, null);
  });

  it('stores, fetches, and deletes transfers correctly', async () => {
    const deviceId = 'dev_test_suite_002';
    const transferId = 'tr_lifecycle_001';

    await addTransfer({
      id: transferId,
      deviceId,
      filename: 'sample_photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      direction: 'phone_to_pc',
      status: 'ready',
      blobUrl: 'http://localhost:3000/api/storage/raw?key=sample',
      blobPathname: 'transfers/test/sample',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const item = await getTransfer(transferId);
    assert.ok(item);
    assert.strictEqual(item.filename, 'sample_photo.jpg');

    const list = await getTransfersForDevice(deviceId);
    assert.strictEqual(list.fromPhone.length, 1);
    assert.strictEqual(list.fromPc.length, 0);

    const deleted = await deleteTransfer(transferId);
    assert.strictEqual(deleted, true);

    const check = await getTransfer(transferId);
    assert.strictEqual(check, null);
  });

  it('lazily cleans up expired transfers automatically', async () => {
    const deviceId = 'dev_test_suite_003';
    const expiredId = 'tr_expired_item';

    await addTransfer({
      id: expiredId,
      deviceId,
      filename: 'old_expired.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      direction: 'pc_to_phone',
      status: 'ready',
      blobUrl: 'http://localhost:3000/api/storage/raw?key=old',
      blobPathname: 'transfers/test/old',
      createdAt: new Date(Date.now() - 7200 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 3600 * 1000).toISOString(), // expired 1h ago
    });

    // Cleanup should discover and prune this item
    const cleanResult = await cleanupExpiredTransfers(deviceId);
    assert.strictEqual(cleanResult.deletedCount, 1);

    const check = await getTransfer(expiredId);
    assert.strictEqual(check, null);
  });
});
