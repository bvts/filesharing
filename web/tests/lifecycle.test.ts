import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createUser,
  getUserByUsername,
  registerPairCode,
  consumePairCode,
  checkPairCodeStatus,
  addTransfer,
  getTransfer,
  deleteTransfer,
  cleanupExpiredTransfers,
  getTransfersForUser,
  getTransfersForDevice,
} from '../src/lib/metadata';
import { hashPassword, verifyPassword } from '../src/lib/crypto';

describe('Transfer Lifecycle, Auth & Isolation Suite', () => {
  it('creates users and rejects duplicate usernames', async () => {
    const { hash, salt } = hashPassword('Secret123');
    const user = await createUser('testuser_alice', hash, salt);

    assert.ok(user.id);
    assert.strictEqual(user.username, 'testuser_alice');

    const fetched = await getUserByUsername('testuser_alice');
    assert.ok(fetched);
    assert.strictEqual(fetched?.id, user.id);
    assert.strictEqual(verifyPassword('Secret123', fetched.passwordHash, fetched.salt), true);

    // Duplicate username must throw
    await assert.rejects(async () => {
      await createUser('TestUser_Alice', hash, salt);
    }, /Username already exists/);
  });

  it('registers, checks status, and consumes a pairing code once with userId binding', async () => {
    const code = '789123';
    const deviceId = 'dev_test_phone_001';
    const userId = 'usr_test_user_001';

    await registerPairCode(code, deviceId, 60, userId);

    const initialStatus = await checkPairCodeStatus(code);
    assert.strictEqual(initialStatus.claimed, false);
    assert.strictEqual(initialStatus.deviceId, deviceId);
    assert.strictEqual(initialStatus.userId, userId);

    const consumedFirst = await consumePairCode(code);
    assert.ok(consumedFirst);
    assert.strictEqual(consumedFirst?.deviceId, deviceId);
    assert.strictEqual(consumedFirst?.userId, userId);

    // After consumption, checkPairCodeStatus should report claimed = true
    const postConsumeStatus = await checkPairCodeStatus(code);
    assert.strictEqual(postConsumeStatus.claimed, true);
    assert.strictEqual(postConsumeStatus.deviceId, deviceId);

    // Second consumption must fail (single-use)
    const consumedSecond = await consumePairCode(code);
    assert.strictEqual(consumedSecond, null);
  });

  it('strictly isolates transfers between different users', async () => {
    const userA = 'usr_alice_isolation';
    const userB = 'usr_bob_isolation';

    const transferA = 'tr_userA_file_001';
    const transferB = 'tr_userB_file_002';

    await addTransfer({
      id: transferA,
      userId: userA,
      deviceId: 'dev_alice',
      filename: 'alice_secret.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      direction: 'pc_to_phone',
      status: 'ready',
      blobUrl: 'http://localhost:3000/api/storage/raw?key=alice',
      blobPathname: 'transfers/alice/doc',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    await addTransfer({
      id: transferB,
      userId: userB,
      deviceId: 'dev_bob',
      filename: 'bob_file.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      direction: 'phone_to_pc',
      status: 'ready',
      blobUrl: 'http://localhost:3000/api/storage/raw?key=bob',
      blobPathname: 'transfers/bob/pic',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    // User A fetches transfers: should only see Alice's file
    const listA = await getTransfersForUser(userA);
    assert.strictEqual(listA.fromPc.length, 1);
    assert.strictEqual(listA.fromPhone.length, 0);
    assert.strictEqual(listA.fromPc[0].filename, 'alice_secret.pdf');

    // User B fetches transfers: should only see Bob's file
    const listB = await getTransfersForUser(userB);
    assert.strictEqual(listB.fromPc.length, 0);
    assert.strictEqual(listB.fromPhone.length, 1);
    assert.strictEqual(listB.fromPhone[0].filename, 'bob_file.jpg');
  });

  it('stores, fetches, and deletes transfers correctly', async () => {
    const userId = 'usr_test_suite_002';
    const transferId = 'tr_lifecycle_001';

    await addTransfer({
      id: transferId,
      userId,
      deviceId: 'dev_suite_002',
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

    const list = await getTransfersForUser(userId);
    assert.strictEqual(list.fromPhone.length, 1);
    assert.strictEqual(list.fromPc.length, 0);

    const deleted = await deleteTransfer(transferId);
    assert.strictEqual(deleted, true);

    const check = await getTransfer(transferId);
    assert.strictEqual(check, null);
  });

  it('lazily cleans up expired transfers automatically', async () => {
    const userId = 'usr_test_suite_003';
    const expiredId = 'tr_expired_item';

    await addTransfer({
      id: expiredId,
      userId,
      deviceId: 'dev_suite_003',
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

    const cleanResult = await cleanupExpiredTransfers(userId);
    assert.strictEqual(cleanResult.deletedCount, 1);

    const check = await getTransfer(expiredId);
    assert.strictEqual(check, null);
  });
});
