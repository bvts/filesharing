export type TransferDirection = 'phone_to_pc' | 'pc_to_phone';

export type TransferStatus = 'pending' | 'ready' | 'downloaded' | 'expired';

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  username: string;
}

export interface TransferMetadata {
  id: string;
  userId: string;
  deviceId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  direction: TransferDirection;
  status: TransferStatus;
  blobUrl: string;
  blobPathname: string;
  downloadToken?: string;
  createdAt: string;
  expiresAt: string;
}

export interface DeviceSession {
  deviceId: string;
  userId?: string;
  name: string;
  pairedAt: string;
  lastActiveAt: string;
  activePairCode?: string;
  pairCodeExpiresAt?: string;
}

export interface PairStartResponse {
  code: string;
  expiresInSeconds: number;
  qrPayload: string;
}

export interface PairCompleteRequest {
  code: string;
  clientType: 'web' | 'ios';
  clientName?: string;
}

export interface PairCompleteResponse {
  deviceId: string;
  userId: string;
  authToken: string;
}

export interface TransfersListResponse {
  deviceId: string;
  userId: string;
  now: string;
  summary: {
    totalCount: number;
    totalSizeBytes: number;
    oldestExpiresAt: string | null;
  };
  fromPhone: TransferMetadata[];
  fromPc: TransferMetadata[];
}
