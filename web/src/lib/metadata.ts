import fs from 'node:fs';
import path from 'node:path';
import { TransferMetadata, DeviceSession } from './types';
import { deleteBlobObject, storeBlobObject } from './storage';

const META_STORE_PATH = 'metadata/state.json';

interface DatabaseState {
  devices: Record<string, DeviceSession>;
  pairCodes: Record<string, { deviceId: string; expiresAt: number }>;
  transfers: Record<string, TransferMetadata>;
}

// In-memory cache synced to local or blob storage
let stateCache: DatabaseState | null = null;
const LOCAL_DB_PATH = path.join(process.cwd(), '.local-storage', 'state.json');

function getInitialState(): DatabaseState {
  return {
    devices: {},
    pairCodes: {},
    transfers: {},
  };
}

async function loadState(): Promise<DatabaseState> {
  if (stateCache) return stateCache;

  if (fs.existsSync(LOCAL_DB_PATH)) {
    try {
      const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
      stateCache = JSON.parse(raw);
      return stateCache!;
    } catch {
      stateCache = getInitialState();
      return stateCache;
    }
  }

  stateCache = getInitialState();
  return stateCache;
}

async function saveState(): Promise<void> {
  if (!stateCache) return;
  const dir = path.dirname(LOCAL_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(stateCache, null, 2), 'utf-8');
}

export function getDefaultExpirationHours(): number {
  const envVal = process.env.TRANSFER_EXPIRATION_HOURS;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 24;
}

export async function registerPairCode(code: string, deviceId: string, ttlSeconds = 600): Promise<void> {
  const state = await loadState();
  state.pairCodes[code] = {
    deviceId,
    expiresAt: Date.now() + ttlSeconds * 1000,
  };
  await saveState();
}

export async function consumePairCode(code: string): Promise<string | null> {
  const state = await loadState();
  const entry = state.pairCodes[code];
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    delete state.pairCodes[code];
    await saveState();
    return null;
  }

  const deviceId = entry.deviceId;
  delete state.pairCodes[code];

  if (!state.devices[deviceId]) {
    state.devices[deviceId] = {
      deviceId,
      name: 'Personal Device',
      pairedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
  }

  await saveState();
  return deviceId;
}

export async function ensureDevice(deviceId: string, name?: string): Promise<DeviceSession> {
  const state = await loadState();
  if (!state.devices[deviceId]) {
    state.devices[deviceId] = {
      deviceId,
      name: name || 'Personal Device',
      pairedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
    await saveState();
  } else {
    state.devices[deviceId].lastActiveAt = new Date().toISOString();
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

  await deleteBlobObject(item.blobUrl || item.blobPathname);
  delete state.transfers[id];
  await saveState();
  return true;
}

export async function cleanupExpiredTransfers(deviceId?: string): Promise<{ deletedCount: number }> {
  const state = await loadState();
  const now = Date.now();
  let deletedCount = 0;

  const toDelete: string[] = [];
  for (const [id, item] of Object.entries(state.transfers)) {
    if (deviceId && item.deviceId !== deviceId) continue;
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

export async function deleteAllTransfersForDevice(deviceId: string): Promise<{ deletedCount: number }> {
  const state = await loadState();
  let deletedCount = 0;

  const toDelete: string[] = [];
  for (const [id, item] of Object.entries(state.transfers)) {
    if (item.deviceId === deviceId) {
      toDelete.push(id);
    }
  }

  for (const id of toDelete) {
    await deleteTransfer(id);
    deletedCount++;
  }

  return { deletedCount };
}

export async function getTransfersForDevice(deviceId: string): Promise<{
  fromPhone: TransferMetadata[];
  fromPc: TransferMetadata[];
  summary: {
    totalCount: number;
    totalSizeBytes: number;
    oldestExpiresAt: string | null;
  };
}> {
  // Always trigger lazy cleanup of expired transfers first
  await cleanupExpiredTransfers(deviceId);

  const state = await loadState();
  const fromPhone: TransferMetadata[] = [];
  const fromPc: TransferMetadata[] = [];
  let totalSizeBytes = 0;
  let oldestExpiresAt: string | null = null;

  for (const item of Object.values(state.transfers)) {
    if (item.deviceId !== deviceId) continue;

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
