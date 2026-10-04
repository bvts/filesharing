import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TransferMetadata, DeviceSession, UserRecord } from './types';
import { deleteBlobObject } from './storage';
import { generateSecureId } from './crypto';

interface DatabaseState {
  users: Record<string, UserRecord>;
  devices: Record<string, DeviceSession>;
  pairCodes: Record<string, { deviceId: string; userId?: string; expiresAt: number; claimed?: boolean }>;
  transfers: Record<string, TransferMetadata>;
}

let stateCache: DatabaseState | null = null;

function getDbFilePath(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const tmpDir = path.join(os.tmpdir(), 'transfer-app-storage');
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
    } catch {}
    return path.join(tmpDir, 'state.json');
  }

  try {
    const localDir = path.join(process.cwd(), '.local-storage');
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    return path.join(localDir, 'state.json');
  } catch {
    const tmpDir = path.join(os.tmpdir(), 'transfer-app-storage');
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
    } catch {}
    return path.join(tmpDir, 'state.json');
  }
}

function getInitialState(): DatabaseState {
  return {
    users: {},
    devices: {},
    pairCodes: {},
    transfers: {},
  };
}

async function loadState(): Promise<DatabaseState> {
  if (stateCache) return stateCache;

  try {
    const dbPath = getDbFilePath();
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf-8');
      const parsed = JSON.parse(raw);
      stateCache = {
        users: parsed.users || {},
        devices: parsed.devices || {},
        pairCodes: parsed.pairCodes || {},
        transfers: parsed.transfers || {},
      };
      return stateCache;
    }
  } catch (err) {
    console.warn('[metadata] Could not load state from disk:', err);
  }

  stateCache = getInitialState();
  return stateCache;
}

async function saveState(): Promise<void> {
  if (!stateCache) return;
  try {
    const dbPath = getDbFilePath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dbPath, JSON.stringify(stateCache, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[metadata] Could not write state to disk (in-memory state preserved):', err);
  }
}

// User Account Management
export async function createUser(username: string, passwordHash: string, salt: string): Promise<UserRecord> {
  const state = await loadState();
  const lower = username.toLowerCase().trim();

  // Check if exists
  for (const u of Object.values(state.users)) {
    if (u.username.toLowerCase() === lower) {
      throw new Error('Username already exists');
    }
  }

  const id = generateSecureId('usr');
  const user: UserRecord = {
    id,
    username: lower,
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
  };

  state.users[id] = user;
  await saveState();
  return user;
}

export async function getUserByUsername(username: string): Promise<UserRecord | null> {
  const state = await loadState();
  const lower = username.toLowerCase().trim();
  for (const u of Object.values(state.users)) {
    if (u.username.toLowerCase() === lower) {
      return u;
    }
  }
  return null;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const state = await loadState();
  return state.users[id] || null;
}

export function getDefaultExpirationHours(): number {
  const envVal = process.env.TRANSFER_EXPIRATION_HOURS;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 24;
}

export async function registerPairCode(
  code: string,
  deviceId: string,
  ttlSeconds = 600,
  userId?: string
): Promise<void> {
  const state = await loadState();
  state.pairCodes[code] = {
    deviceId,
    userId,
    expiresAt: Date.now() + ttlSeconds * 1000,
    claimed: false,
  };
  await saveState();
}

export async function checkPairCodeStatus(
  code: string
): Promise<{ claimed: boolean; deviceId: string | null; userId?: string | null }> {
  const state = await loadState();
  const entry = state.pairCodes[code];
  if (!entry) return { claimed: false, deviceId: null, userId: null };

  if (Date.now() > entry.expiresAt) {
    delete state.pairCodes[code];
    await saveState();
    return { claimed: false, deviceId: null, userId: null };
  }

  return {
    claimed: Boolean(entry.claimed),
    deviceId: entry.deviceId,
    userId: entry.userId || null,
  };
}

export async function consumePairCode(
  code: string
): Promise<{ deviceId: string; userId?: string } | null> {
  const state = await loadState();
  const entry = state.pairCodes[code];
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    delete state.pairCodes[code];
    await saveState();
    return null;
  }

  if (entry.claimed) {
    return null;
  }

  const deviceId = entry.deviceId;
  const userId = entry.userId;
  entry.claimed = true;
  entry.expiresAt = Date.now() + 60 * 1000; // retain briefly so polling detects it

  if (!state.devices[deviceId]) {
    state.devices[deviceId] = {
      deviceId,
      userId,
      name: 'Personal Device',
      pairedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
  } else {
    state.devices[deviceId].lastActiveAt = new Date().toISOString();
    if (userId) {
      state.devices[deviceId].userId = userId;
    }
  }

  await saveState();
  return { deviceId, userId };
}

export async function ensureDevice(deviceId: string, name?: string, userId?: string): Promise<DeviceSession> {
  const state = await loadState();
  if (!state.devices[deviceId]) {
    state.devices[deviceId] = {
      deviceId,
      userId,
      name: name || 'Personal Device',
      pairedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
    await saveState();
  } else {
    state.devices[deviceId].lastActiveAt = new Date().toISOString();
    if (userId) {
      state.devices[deviceId].userId = userId;
    }
    await saveState();
  }
  return state.devices[deviceId];
}

export async function addTransfer(transfer: TransferMetadata): Promise<void> {
  const state = await loadState();
  state.transfers[transfer.id] = transfer;
  await saveState();
}

export async function getTransfer(id: string): Promise<TransferMetadata | null> {
  const state = await loadState();
  return state.transfers[id] || null;
}

export async function deleteTransfer(id: string): Promise<boolean> {
  const state = await loadState();
  const item = state.transfers[id];
  if (!item) return false;

  try {
    await deleteBlobObject(item.blobPathname);
  } catch (err) {
    console.warn('[metadata] Could not remove storage blob:', err);
  }

  delete state.transfers[id];
  await saveState();
  return true;
}

export async function cleanupExpiredTransfers(ownerId?: string): Promise<{ deletedCount: number }> {
  const state = await loadState();
  const now = Date.now();
  let deletedCount = 0;

  const toDelete: string[] = [];
  for (const [id, item] of Object.entries(state.transfers)) {
    if (ownerId && item.userId !== ownerId && item.deviceId !== ownerId) {
      continue;
    }

    const expiresTimestamp = new Date(item.expiresAt).getTime();
    if (now > expiresTimestamp) {
      toDelete.push(id);
    }
  }

  for (const id of toDelete) {
    await deleteTransfer(id);
    deletedCount++;
  }

  return { deletedCount };
}

export async function deleteAllTransfersForUser(userId: string): Promise<{ deletedCount: number }> {
  const state = await loadState();
  let deletedCount = 0;

  const toDelete: string[] = [];
  for (const [id, item] of Object.entries(state.transfers)) {
    if (item.userId === userId || item.deviceId === userId) {
      toDelete.push(id);
    }
  }

  for (const id of toDelete) {
    await deleteTransfer(id);
    deletedCount++;
  }

  return { deletedCount };
}

export async function deleteAllTransfersForDevice(deviceId: string): Promise<{ deletedCount: number }> {
  return deleteAllTransfersForUser(deviceId);
}

export async function getTransfersForUser(
  userId: string,
  deviceId?: string
): Promise<{
  fromPhone: TransferMetadata[];
  fromPc: TransferMetadata[];
  summary: {
    totalCount: number;
    totalSizeBytes: number;
    oldestExpiresAt: string | null;
  };
}> {
  // Always trigger lazy cleanup of expired transfers first
  await cleanupExpiredTransfers(userId);

  const state = await loadState();
  const fromPhone: TransferMetadata[] = [];
  const fromPc: TransferMetadata[] = [];
  let totalSizeBytes = 0;
  let oldestExpiresAt: string | null = null;

  for (const item of Object.values(state.transfers)) {
    // Check user ownership or device ownership
    const isOwner = item.userId ? item.userId === userId : item.deviceId === deviceId || item.deviceId === userId;
    if (!isOwner) continue;

    if (item.direction === 'phone_to_pc') {
      fromPhone.push(item);
    } else {
      fromPc.push(item);
    }

    totalSizeBytes += item.sizeBytes;
    if (!oldestExpiresAt || new Date(item.expiresAt) < new Date(oldestExpiresAt)) {
      oldestExpiresAt = item.expiresAt;
    }
  }

  // Sort descending by creation date
  fromPhone.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  fromPc.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    fromPhone,
    fromPc,
    summary: {
      totalCount: fromPhone.length + fromPc.length,
      totalSizeBytes,
      oldestExpiresAt,
    },
  };
}

export async function getTransfersForDevice(
  deviceId: string,
  userId?: string
): Promise<{
  fromPhone: TransferMetadata[];
  fromPc: TransferMetadata[];
  summary: {
    totalCount: number;
    totalSizeBytes: number;
    oldestExpiresAt: string | null;
  };
}> {
  return getTransfersForUser(userId || deviceId, deviceId);
}
