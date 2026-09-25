'use client';

import React, { useEffect, useRef, useState } from 'react';
import { TransferMetadata, TransfersListResponse } from '@/lib/types';

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

export default function TransferPage() {
  const [paired, setPaired] = useState<boolean | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  const [pairCode, setPairCode] = useState<string>('');
  const [pairInput, setPairInput] = useState<string>('');
  const [qrPayload, setQrPayload] = useState<string>('');
  const [isPairingLoading, setIsPairingLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [fromPhone, setFromPhone] = useState<TransferMetadata[]>([]);
  const [fromPc, setFromPc] = useState<TransferMetadata[]>([]);
  const [summary, setSummary] = useState<{
    totalCount: number;
    totalSizeBytes: number;
    oldestExpiresAt: string | null;
  }>({ totalCount: 0, totalSizeBytes: 0, oldestExpiresAt: null });

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Update timer every minute for expiration labels
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Check URL searchParams for quick pairing ?pair=123456
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('pair');
    if (codeParam) {
      completePair(codeParam);
    } else {
      checkPairingStatus();
    }
  }, []);

  async function checkPairingStatus() {
    try {
      const res = await fetch('/api/transfers');
      if (res.status === 200) {
        const data: TransfersListResponse = await res.json();
        setPaired(true);
        setDeviceId(data.deviceId);
        setFromPhone(data.fromPhone);
        setFromPc(data.fromPc);
        setSummary(data.summary);
      } else {
        setPaired(false);
        startPairingSession();
      }
    } catch {
      setPaired(false);
      startPairingSession();
    }
  }

  async function startPairingSession() {
    try {
      const res = await fetch('/api/pair/start', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setPairCode(data.code);
        setQrPayload(data.qrPayload);
      }
    } catch {
      setErrorMessage('Could not generate pairing session');
    }
  }

  async function completePair(codeToUse: string) {
    if (!codeToUse) return;
    setIsPairingLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/pair/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeToUse, clientType: 'web' }),
      });
      if (res.ok) {
        const data = await res.json();
        setPaired(true);
        setDeviceId(data.deviceId);
        window.history.replaceState({}, '', '/');
        fetchTransfers();
      } else {
        const err = await res.json();
        setErrorMessage(err.error || 'Pairing failed. Check code.');
      }
    } catch {
      setErrorMessage('Connection error during pairing');
    } finally {
      setIsPairingLoading(false);
    }
  }

  async function fetchTransfers(silent = false) {
    if (!silent) setIsRefreshing(true);
    try {
      const res = await fetch('/api/transfers');
      if (res.ok) {
        const data: TransfersListResponse = await res.json();
        setFromPhone(data.fromPhone);
        setFromPc(data.fromPc);
        setSummary(data.summary);
      } else if (res.status === 401) {
        setPaired(false);
        startPairingSession();
      }
    } catch {
      // offline or silent fail
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }

  // Periodic poll every 5 seconds when tab is active
  useEffect(() => {
    if (!paired) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchTransfers(true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [paired]);

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadProgress(10);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('direction', 'pc_to_phone');

      try {
        const res = await fetch('/api/transfers', {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          setUploadProgress(Math.round(((i + 1) / files.length) * 100));
        } else {
          const err = await res.json();
          alert(`Failed to upload ${file.name}: ${err.error || 'Server error'}`);
        }
      } catch {
        alert(`Network error uploading ${file.name}`);
      }
    }

    setIsUploading(false);
    setUploadProgress(0);
    fetchTransfers();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/transfers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFromPhone((prev) => prev.filter((item) => item.id !== id));
        setFromPc((prev) => prev.filter((item) => item.id !== id));
        fetchTransfers(true);
      }
    } catch {
      alert('Delete failed');
    }
  }

  async function handleClearExpired() {
    try {
      await fetch('/api/transfers?action=clear_expired', { method: 'DELETE' });
      fetchTransfers();
    } catch {
      alert('Clear expired failed');
    }
  }

  async function handleClearAll() {
    if (!confirm('Permanently delete all temporary transfers on this device?')) return;
    try {
      await fetch('/api/transfers?action=clear_all', { method: 'DELETE' });
      fetchTransfers();
    } catch {
      alert('Clear all failed');
    }
  }

  // Drag and drop handlers
  const [isDragOver, setIsDragOver] = useState(false);

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  }

  if (paired === null) {
    return (
      <main style={{ padding: '40px', maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ color: 'var(--text-muted)' }}>INITIALIZING SYSTEM...</div>
      </main>
    );
  }

  if (!paired) {
    return (
      <main
        style={{
          padding: '40px 20px',
          maxWidth: '520px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '28px',
        }}
      >
        <header style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
          <div className="mono-title">TRANSFER</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>
            DEVICE PAIRING
          </div>
        </header>

        <section
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            CONNECT THIS BROWSER TO YOUR PHONE
          </div>

          <div
            style={{
              padding: '16px',
              background: '#080808',
              border: '1px dashed var(--border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              PAIRING CODE (10 MIN)
            </div>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 700,
                letterSpacing: '0.25em',
                color: '#fff',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {pairCode || '------'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
              Enter this code in your phone app or enter the code from your phone below
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginTop: '8px',
            }}
          >
            <input
              type="text"
              placeholder="ENTER 6-DIGIT CODE"
              maxLength={6}
              value={pairInput}
              onChange={(e) => setPairInput(e.target.value.replace(/\D/g, ''))}
              style={{ flex: 1, textAlign: 'center', letterSpacing: '0.15em' }}
            />
            <button
              className="primary"
              disabled={pairInput.length !== 6 || isPairingLoading}
              onClick={() => completePair(pairInput)}
            >
              {isPairingLoading ? 'CONNECTING...' : 'CONNECT'}
            </button>
          </div>

          {errorMessage && (
            <div style={{ color: 'var(--danger)', fontSize: '11px' }}>{errorMessage}</div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: '32px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        flex: 1,
      }}
    >
      {/* Header bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span className="mono-title">TRANSFER</span>
          <span className="status-badge connected">
            <span className="status-dot"></span>
            PHONE CONNECTED
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => fetchTransfers(false)} disabled={isRefreshing}>
            {isRefreshing ? 'SYNCING...' : 'REFRESH'}
          </button>
        </div>
      </header>

      {/* Area 1: FROM PHONE */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            FROM PHONE ({fromPhone.length})
          </div>
        </div>

        {fromPhone.length === 0 ? (
          <div
            style={{
              padding: '24px',
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
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      background: '#1a1a1a',
                      color: 'var(--text-muted)',
                      padding: '2px 5px',
                      borderRadius: '2px',
                      letterSpacing: '0.05em',
                    }}
                  >
                    [{getFileIconLabel(item.mimeType, item.filename)}]
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: 'var(--text-main)',
                      }}
                      title={item.filename}
                    >
                      {item.filename}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {formatBytes(item.sizeBytes)} · {formatExpiration(item.expiresAt, currentTime)}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <a href={`/api/transfers/${item.id}/download`} download={item.filename}>
                    <button className="primary">DOWNLOAD</button>
                  </a>
                  <button className="danger" onClick={() => handleDelete(item.id)}>
                    DELETE
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Area 2: FROM PC */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          FROM PC ({fromPc.length})
        </div>

        {/* Upload drop zone */}
        <div
          ref={dropZoneRef}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: isDragOver ? '1px solid var(--accent)' : '1px dashed var(--border)',
            background: isDragOver ? 'var(--surface-hover)' : 'var(--surface)',
            padding: '28px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color 0.15s ease, background 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFileUpload(e.target.files)}
          />

          {isUploading ? (
            <div style={{ color: 'var(--accent)', fontSize: '12px', letterSpacing: '0.05em' }}>
              UPLOADING {uploadProgress}%
            </div>
          ) : (
            <>
              <div style={{ fontSize: '12px', color: 'var(--text-main)' }}>
                DROP FILES HERE OR CLICK TO SELECT
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Directly available to phone after upload
              </div>
            </>
          )}
        </div>

        {/* PC Sent file list */}
        {fromPc.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {fromPc.map((item) => (
              <div
                key={item.id}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      background: '#1a1a1a',
                      color: 'var(--text-muted)',
                      padding: '2px 5px',
                      borderRadius: '2px',
                      letterSpacing: '0.05em',
                    }}
                  >
                    [{getFileIconLabel(item.mimeType, item.filename)}]
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: 'var(--text-main)',
                      }}
                      title={item.filename}
                    >
                      {item.filename}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {formatBytes(item.sizeBytes)} · {formatExpiration(item.expiresAt, currentTime)}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <a href={`/api/transfers/${item.id}/download`} download={item.filename}>
                    <button>DOWNLOAD</button>
                  </a>
                  <button className="danger" onClick={() => handleDelete(item.id)}>
                    DELETE
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Storage Management Footer */}
      <footer
        style={{
          marginTop: 'auto',
          borderTop: '1px solid var(--border)',
          paddingTop: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          {summary.totalCount} {summary.totalCount === 1 ? 'FILE' : 'FILES'} ·{' '}
          {formatBytes(summary.totalSizeBytes)}
          {summary.oldestExpiresAt && (
            <> · OLDEST {formatExpiration(summary.oldestExpiresAt, currentTime).toUpperCase()}</>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleClearExpired}>CLEAR EXPIRED</button>
          <button className="danger" onClick={handleClearAll}>
            CLEAR ALL
          </button>
        </div>
      </footer>
    </main>
  );
}
