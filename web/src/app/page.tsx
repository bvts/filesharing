'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { TransferMetadata, AuthUser } from '@/lib/types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatExpiration(expiresAt: string, now: Date): string {
  const diff = new Date(expiresAt).getTime() - now.getTime();
  if (diff <= 0) return 'expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours > 0) return `expires in ${hours}h`;
  const minutes = Math.floor(diff / (1000 * 60));
  return `expires in ${minutes}m`;
}

function getFileIconLabel(mimeType: string, filename: string): string {
  if (mimeType.startsWith('image/')) return 'IMG';
  if (mimeType.startsWith('video/')) return 'VID';
  if (mimeType.startsWith('audio/')) return 'AUD';
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('zip') || filename.endsWith('.zip')) return 'ZIP';
  return 'FILE';
}

interface UploadStatus {
  total: number;
  current: number;
  currentName: string;
  progressPercent: number;
  failedCount: number;
  errors: string[];
}

export default function TransferPage() {
  // Auth state
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'pair'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  // Pairing state (for phone linking)
  const [pairCode, setPairCode] = useState<string>('');
  const [pairInput, setPairInput] = useState<string>('');
  const [isPairingLoading, setIsPairingLoading] = useState(false);
  const [showPairModal, setShowPairModal] = useState(false);

  // Transfers state
  const [fromPhone, setFromPhone] = useState<TransferMetadata[]>([]);
  const [fromPc, setFromPc] = useState<TransferMetadata[]>([]);
  const [summary, setSummary] = useState<{
    totalCount: number;
    totalSizeBytes: number;
    oldestExpiresAt: string | null;
  }>({ totalCount: 0, totalSizeBytes: 0, oldestExpiresAt: null });

  // Uploading & Bulk state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [canWebShare, setCanWebShare] = useState(false);
  const [activeSharingId, setActiveSharingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Check Web Share API support
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      setCanWebShare(true);
    }
  }, []);

  // Update timer every minute for expiration labels
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Check Auth session on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            setCurrentUser(data.user);
          }
        }
      } catch (e) {
        console.warn('Auth check error:', e);
      } finally {
        setIsAuthChecking(false);
      }
    }
    checkAuth();
  }, []);

  // Fetch transfers
  const fetchTransfers = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const res = await fetch('/api/transfers');
      if (res.ok) {
        const data = await res.json();
        setFromPhone(data.fromPhone || []);
        setFromPc(data.fromPc || []);
        setSummary(
          data.summary || {
            totalCount: 0,
            totalSizeBytes: 0,
            oldestExpiresAt: null,
          }
        );
      } else if (res.status === 401) {
        setCurrentUser(null);
      }
    } catch (err) {
      console.error('Fetch transfers failed:', err);
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }, []);

  // Start pairing code generation
  const startPairingCode = useCallback(async () => {
    try {
      const res = await fetch('/api/pair/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setPairCode(data.code);
      }
    } catch (e) {
      console.error('Pair start failed:', e);
    }
  }, []);

  // Fetch transfers when authenticated
  useEffect(() => {
    if (currentUser) {
      fetchTransfers();
      startPairingCode();
    }
  }, [currentUser, fetchTransfers, startPairingCode]);

  // Real-time polling for transfers when authenticated
  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(() => {
      fetchTransfers(true);
    }, 3000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchTransfers(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentUser, fetchTransfers]);

  // Poll pairing status to detect iPhone connection
  useEffect(() => {
    if (!currentUser || !pairCode) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pair/poll?code=${encodeURIComponent(pairCode)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.paired) {
            // Re-fetch transfers immediately when phone pairs
            fetchTransfers(true);
            // Refresh code
            startPairingCode();
          }
        }
      } catch {}
    }, 2000);

    return () => clearInterval(interval);
  }, [currentUser, pairCode, fetchTransfers, startPairingCode]);

  // Auth Submit: Login or Signup
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthSubmitting(true);

    const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername.trim(), password: authPassword }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.user) {
        setCurrentUser(data.user);
        setAuthPassword('');
      } else {
        setAuthError(data.error || 'Authentication failed');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Network error');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  // Complete pair code entry
  const completePair = async (codeToPair: string) => {
    setIsPairingLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/pair/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeToPair, clientType: 'web' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Fetch current user from session
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.user) {
            setCurrentUser(meData.user);
          }
        } else {
          setCurrentUser({ id: data.userId || data.deviceId, username: 'paired_user' });
        }
        setShowPairModal(false);
      } else {
        setAuthError(data.error || 'Invalid or expired pair code');
      }
    } catch (e: any) {
      setAuthError(e.message || 'Connection failed');
    } finally {
      setIsPairingLoading(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setCurrentUser(null);
    setFromPhone([]);
    setFromPc([]);
  };

  // Bulk File Upload Handler
  const handleFilesUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsUploading(true);
    const status: UploadStatus = {
      total: fileArray.length,
      current: 0,
      currentName: fileArray[0].name,
      progressPercent: 0,
      failedCount: 0,
      errors: [],
    };
    setUploadStatus(status);

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setUploadStatus((prev) =>
        prev
          ? {
              ...prev,
              current: i + 1,
              currentName: file.name,
              progressPercent: Math.round(((i) / fileArray.length) * 100),
            }
          : null
      );

      const formData = new FormData();
      formData.append('file', file);
      formData.append('direction', 'pc_to_phone');

      try {
        const res = await fetch('/api/transfers', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          status.failedCount++;
          status.errors.push(`${file.name}: ${errData.error || 'Upload failed'}`);
        }
      } catch (err: any) {
        status.failedCount++;
        status.errors.push(`${file.name}: ${err.message || 'Network error'}`);
      }
    }

    setUploadStatus((prev) =>
      prev
        ? {
            ...prev,
            current: fileArray.length,
            progressPercent: 100,
          }
        : null
    );

    await fetchTransfers(true);

    setTimeout(() => {
      setIsUploading(false);
      setUploadStatus(null);
    }, 2000);
  };

  // Drag and Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesUpload(e.dataTransfer.files);
    }
  };

  // Single Item Delete
  const handleDeleteTransfer = async (id: string) => {
    try {
      await fetch(`/api/transfers/${id}`, { method: 'DELETE' });
      fetchTransfers(true);
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Clear Expired / All
  const handleClearTransfers = async (action: 'clear_expired' | 'clear_all') => {
    try {
      await fetch(`/api/transfers?action=${action}`, { method: 'DELETE' });
      fetchTransfers(true);
    } catch (err) {
      console.error('Clear error:', err);
    }
  };

  // Mobile Web Share Handler
  const handleWebShare = async (item: TransferMetadata) => {
    if (!canWebShare) return;
    setActiveSharingId(item.id);

    try {
      const downloadUrl = `/api/transfers/${item.id}/download`;
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const file = new File([blob], item.filename, { type: item.mimeType || blob.type });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: item.filename,
        });
      } else {
        await navigator.share({
          title: item.filename,
          url: window.location.origin + downloadUrl,
        });
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.warn('Share error fallback to download:', e);
        window.location.href = `/api/transfers/${item.id}/download`;
      }
    } finally {
      setActiveSharingId(null);
    }
  };

  if (isAuthChecking) {
    return (
      <main
        style={{
          width: '100%',
          maxWidth: '520px',
          margin: '0 auto',
          padding: 'max(40px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(40px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>INITIALIZING SYSTEM...</div>
      </main>
    );
  }

  // Auth Screen (when user is not logged in)
  if (!currentUser) {
    return (
      <main
        style={{
          width: '100%',
          maxWidth: '460px',
          margin: '0 auto',
          padding: 'max(32px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(32px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          boxSizing: 'border-box',
        }}
      >
        <header style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
          <div className="mono-title">TRANSFER</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>
            PRIVATE CROSS-DEVICE TRANSFER
          </div>
        </header>

        <section
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            boxSizing: 'border-box',
          }}
        >
          {/* Mode Switcher */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: '16px', paddingBottom: '8px' }}>
            <button
              onClick={() => { setAuthMode('login'); setAuthError(null); }}
              style={{
                border: 'none',
                padding: '4px 0',
                color: authMode === 'login' ? '#fff' : 'var(--text-muted)',
                borderBottom: authMode === 'login' ? '2px solid #fff' : 'none',
                fontWeight: authMode === 'login' ? 600 : 400,
                background: 'transparent',
              }}
            >
              LOG IN
            </button>
            <button
              onClick={() => { setAuthMode('signup'); setAuthError(null); }}
              style={{
                border: 'none',
                padding: '4px 0',
                color: authMode === 'signup' ? '#fff' : 'var(--text-muted)',
                borderBottom: authMode === 'signup' ? '2px solid #fff' : 'none',
                fontWeight: authMode === 'signup' ? 600 : 400,
                background: 'transparent',
              }}
            >
              CREATE ACCOUNT
            </button>
            <button
              onClick={() => { setAuthMode('pair'); setAuthError(null); }}
              style={{
                border: 'none',
                padding: '4px 0',
                color: authMode === 'pair' ? '#fff' : 'var(--text-muted)',
                borderBottom: authMode === 'pair' ? '2px solid #fff' : 'none',
                fontWeight: authMode === 'pair' ? 600 : 400,
                background: 'transparent',
              }}
            >
              PAIR CODE
            </button>
          </div>

          {authMode === 'pair' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Enter the 6-digit pair code from your logged-in PC or phone:
              </div>
              <input
                type="text"
                placeholder="000000"
                maxLength={6}
                value={pairInput}
                onChange={(e) => setPairInput(e.target.value.replace(/\D/g, ''))}
                style={{ textAlign: 'center', letterSpacing: '0.2em', fontSize: '20px' }}
              />
              <button
                className="primary"
                disabled={pairInput.length !== 6 || isPairingLoading}
                onClick={() => completePair(pairInput)}
                style={{ width: '100%', padding: '10px' }}
              >
                {isPairingLoading ? 'CONNECTING...' : 'CONNECT VIA PAIR CODE'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Username
                </label>
                <input
                  type="text"
                  placeholder="e.g. alex"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  required
                  autoCapitalize="none"
                  autoComplete="username"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                  autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                />
              </div>

              {authError && (
                <div style={{ color: 'var(--danger)', fontSize: '11px', wordBreak: 'break-word' }}>
                  {authError}
                </div>
              )}

              <button
                type="submit"
                className="primary"
                disabled={isAuthSubmitting || !authUsername || !authPassword}
                style={{ width: '100%', padding: '10px', marginTop: '6px' }}
              >
                {isAuthSubmitting
                  ? 'AUTHENTICATING...'
                  : authMode === 'signup'
                  ? 'CREATE ACCOUNT'
                  : 'SIGN IN'}
              </button>
            </form>
          )}

          <div style={{ fontSize: '10px', color: 'var(--text-faint)', lineHeight: 1.4 }}>
            Zero third-party trackers. All transfers are encrypted and isolated strictly to your account.
          </div>
        </section>
      </main>
    );
  }

  // Authenticated Dashboard
  return (
    <main
      style={{
        width: '100%',
        maxWidth: '720px',
        margin: '0 auto',
        padding: 'max(20px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        flex: 1,
        boxSizing: 'border-box',
      }}
    >
      {/* Header bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '14px',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <span className="mono-title">TRANSFER</span>
          <span className="status-badge connected">
            <span className="status-dot"></span>
            {currentUser.username.toUpperCase()}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setShowPairModal(!showPairModal)}>
            {showPairModal ? 'HIDE PAIR' : 'PAIR PHONE'}
          </button>
          <button onClick={() => fetchTransfers(false)} disabled={isRefreshing}>
            {isRefreshing ? 'SYNCING...' : 'REFRESH'}
          </button>
          <button onClick={handleLogout} className="danger">
            LOGOUT
          </button>
        </div>
      </header>

      {/* Phone Pairing Box (Toggleable or automatically visible if code available) */}
      {showPairModal && (
        <section
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              LINK IPHONE TO ACCOUNT
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-faint)' }}>VALID 10 MIN</span>
          </div>

          <div
            style={{
              padding: '12px',
              background: '#080808',
              border: '1px dashed var(--border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <div
              style={{
                fontSize: '24px',
                fontWeight: 700,
                letterSpacing: '0.25em',
                color: '#fff',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {pairCode || '------'}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
              Open Transfer App on iPhone, enter this code to connect your account.
            </div>
          </div>
        </section>
      )}

      {/* Area 1: FROM PHONE */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            FROM PHONE ({fromPhone.length})
          </div>
        </div>

        {fromPhone.length === 0 ? (
          <div
            style={{
              padding: '20px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-muted)',
              fontSize: '12px',
            }}
          >
            NO TRANSFERS FROM PHONE
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {fromPhone.map((item) => (
              <div
                key={item.id}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  minWidth: 0,
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                  <span
                    className="flex-shrink-0"
                    style={{
                      fontSize: '9px',
                      background: '#1a1a1a',
                      color: 'var(--text-muted)',
                      padding: '2px 5px',
                      borderRadius: '2px',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {getFileIconLabel(item.mimeType, item.filename)}
                  </span>
                  <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                    <div className="truncate" style={{ fontSize: '13px', fontWeight: 500, color: '#fff' }}>
                      {item.filename}
                    </div>
                    <div className="truncate" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {formatBytes(item.sizeBytes)} · {formatExpiration(item.expiresAt, currentTime)}
                    </div>
                  </div>
                </div>

                <div className="flex-shrink-0" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {canWebShare && (
                    <button
                      onClick={() => handleWebShare(item)}
                      disabled={activeSharingId === item.id}
                      style={{ padding: '4px 8px' }}
                    >
                      {activeSharingId === item.id ? '...' : 'SHARE'}
                    </button>
                  )}
                  <a href={`/api/transfers/${item.id}/download`} download={item.filename}>
                    <button className="primary" style={{ padding: '4px 8px' }}>
                      GET
                    </button>
                  </a>
                  <button
                    className="danger"
                    onClick={() => handleDeleteTransfer(item.id)}
                    style={{ padding: '4px 8px' }}
                  >
                    DEL
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Area 2: FROM PC / DROP ZONE & BULK UPLOAD */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            SEND TO PHONE / UPLOAD
          </div>
        </div>

        {/* Hidden Multi-file input */}
        <input
          type="file"
          ref={fileInputRef}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) handleFilesUpload(e.target.files);
          }}
        />

        {/* Dropzone */}
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: '1px dashed var(--border)',
            background: 'var(--surface)',
            padding: '24px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: 'pointer',
            minHeight: '100px',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          {isUploading && uploadStatus ? (
            <div style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', color: '#fff', fontWeight: 600 }}>
                UPLOADING {uploadStatus.current} OF {uploadStatus.total}: {uploadStatus.currentName}
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${uploadStatus.progressPercent}%` }} />
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                {uploadStatus.progressPercent}% · {uploadStatus.failedCount > 0 ? `${uploadStatus.failedCount} failed` : 'Sending to phone...'}
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-main)' }}>
                DRAG & DROP FILES OR CLICK TO SELECT
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Supports multiple images, videos, documents, or archives (up to 500 MB)
              </div>
            </>
          )}
        </div>

        {/* List of transfers sent from PC */}
        {fromPc.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
            {fromPc.map((item) => (
              <div
                key={item.id}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  minWidth: 0,
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                  <span
                    className="flex-shrink-0"
                    style={{
                      fontSize: '9px',
                      background: '#1a1a1a',
                      color: 'var(--text-muted)',
                      padding: '2px 5px',
                      borderRadius: '2px',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {getFileIconLabel(item.mimeType, item.filename)}
                  </span>
                  <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                    <div className="truncate" style={{ fontSize: '13px', fontWeight: 500, color: '#fff' }}>
                      {item.filename}
                    </div>
                    <div className="truncate" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {formatBytes(item.sizeBytes)} · {formatExpiration(item.expiresAt, currentTime)}
                    </div>
                  </div>
                </div>

                <div className="flex-shrink-0" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <a href={`/api/transfers/${item.id}/download`} download={item.filename}>
                    <button style={{ padding: '4px 8px' }}>GET</button>
                  </a>
                  <button
                    className="danger"
                    onClick={() => handleDeleteTransfer(item.id)}
                    style={{ padding: '4px 8px' }}
                  >
                    DEL
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer Metrics & Actions */}
      <footer
        style={{
          borderTop: '1px solid var(--border)',
          paddingTop: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          {summary.totalCount} {summary.totalCount === 1 ? 'FILE' : 'FILES'} · {formatBytes(summary.totalSizeBytes)}
          {summary.oldestExpiresAt ? ` · EXPIRES ${formatExpiration(summary.oldestExpiresAt, currentTime)}` : ''}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => handleClearTransfers('clear_expired')}>
            CLEAR EXPIRED
          </button>
          <button onClick={() => handleClearTransfers('clear_all')} className="danger">
            CLEAR ALL
          </button>
        </div>
      </footer>
    </main>
  );
}
