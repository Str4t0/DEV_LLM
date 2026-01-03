// frontend/src/components/PendingBackups.tsx
// Pending backup-ok panel - Revert/Keep gombok

import React from 'react';

interface PendingBackup {
  id: string;
  file_path: string;
  timestamp: number;
  timestamp_formatted: string;
  description: string;
  status: string;
  original_lines: number;
  modified_lines: number;
}

interface PendingBackupsProps {
  backups: PendingBackup[];
  onRevert: (backupId: string) => void;
  onKeep: (backupId: string) => void;
  onRevertAll: () => void;
  onKeepAll: () => void;
  isLoading?: boolean;
}

export const PendingBackups: React.FC<PendingBackupsProps> = ({
  backups,
  onRevert,
  onKeep,
  onRevertAll,
  onKeepAll,
  isLoading = false,
}) => {
  if (backups.length === 0) {
    return null;
  }

  return (
    <div className="pending-backups-panel">
      <div className="pending-backups-header">
        <span className="pending-backups-title">
          ⏳ Pending módosítások ({backups.length})
        </span>
        <div className="pending-backups-actions">
          <button
            className="pending-action-btn keep-all"
            onClick={onKeepAll}
            disabled={isLoading}
            title="Összes megtartása"
          >
            ✓ Keep All
          </button>
          <button
            className="pending-action-btn revert-all"
            onClick={onRevertAll}
            disabled={isLoading}
            title="Összes visszaállítása"
          >
            ↩ Revert All
          </button>
        </div>
      </div>
      
      <div className="pending-backups-list">
        {backups.map((backup) => (
          <div key={backup.id} className="pending-backup-item">
            <div className="pending-backup-info">
              <span className="pending-backup-file">
                📄 {getFileName(backup.file_path)}
              </span>
              <span className="pending-backup-time">
                {backup.timestamp_formatted}
              </span>
              <span className="pending-backup-lines">
                {backup.original_lines} → {backup.modified_lines} sor
              </span>
            </div>
            <div className="pending-backup-buttons">
              <button
                className="pending-btn keep"
                onClick={() => onKeep(backup.id)}
                disabled={isLoading}
                title="Megtartás"
              >
                ✓
              </button>
              <button
                className="pending-btn revert"
                onClick={() => onRevert(backup.id)}
                disabled={isLoading}
                title="Visszaállítás"
              >
                ↩
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Fájlnév kinyerése útvonalból
function getFileName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

// ═══════════════════════════════════════════════════════════════
// INLINE FILE EDIT NOTIFICATION
// ═══════════════════════════════════════════════════════════════

interface FileEditNotificationProps {
  fileName: string;
  backupId: string;
  timestamp: string;
  onKeep: () => void;
  onRevert: () => void;
  isLoading?: boolean;
}

export const FileEditNotification: React.FC<FileEditNotificationProps> = ({
  fileName,
  backupId,
  timestamp,
  onKeep,
  onRevert,
  isLoading = false,
}) => {
  return (
    <div className="file-edit-notification">
      <div className="file-edit-info">
        <span className="file-edit-icon">📝</span>
        <span className="file-edit-text">
          <strong>{fileName}</strong> módosítva ({timestamp})
        </span>
      </div>
      <div className="file-edit-buttons">
        <button
          className="file-edit-btn keep"
          onClick={onKeep}
          disabled={isLoading}
        >
          ✓ Keep
        </button>
        <button
          className="file-edit-btn revert"
          onClick={onRevert}
          disabled={isLoading}
        >
          ↩ Revert
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// CSS STYLES (add to App.css)
// ═══════════════════════════════════════════════════════════════

export const PENDING_BACKUPS_CSS = `
/* Pending Backups Panel */
.pending-backups-panel {
  background: #1e1e2e;
  border: 1px solid #3d3d5c;
  border-radius: 6px;
  margin: 8px;
  overflow: hidden;
}

.pending-backups-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #2d2d3d;
  border-bottom: 1px solid #3d3d5c;
}

.pending-backups-title {
  font-size: 13px;
  font-weight: 600;
  color: #e0e0e0;
}

.pending-backups-actions {
  display: flex;
  gap: 6px;
}

.pending-action-btn {
  padding: 4px 10px;
  font-size: 11px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.pending-action-btn.keep-all {
  background: #2d5a27;
  color: #7fff7f;
}

.pending-action-btn.keep-all:hover {
  background: #3d7a37;
}

.pending-action-btn.revert-all {
  background: #5a2727;
  color: #ff7f7f;
}

.pending-action-btn.revert-all:hover {
  background: #7a3737;
}

.pending-backups-list {
  max-height: 150px;
  overflow-y: auto;
}

.pending-backup-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  border-bottom: 1px solid #2d2d3d;
}

.pending-backup-item:last-child {
  border-bottom: none;
}

.pending-backup-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.pending-backup-file {
  font-size: 12px;
  color: #9cdcfe;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pending-backup-time {
  font-size: 11px;
  color: #808080;
}

.pending-backup-lines {
  font-size: 11px;
  color: #6a9955;
}

.pending-backup-buttons {
  display: flex;
  gap: 4px;
}

.pending-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.pending-btn.keep {
  background: #2d5a27;
  color: #7fff7f;
}

.pending-btn.keep:hover {
  background: #3d7a37;
}

.pending-btn.revert {
  background: #5a2727;
  color: #ff7f7f;
}

.pending-btn.revert:hover {
  background: #7a3737;
}

/* File Edit Notification (inline) */
.file-edit-notification {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: linear-gradient(135deg, #2d3a2d 0%, #1e2e1e 100%);
  border: 1px solid #3d5a3d;
  border-radius: 6px;
  margin: 4px 0;
}

.file-edit-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-edit-icon {
  font-size: 16px;
}

.file-edit-text {
  font-size: 12px;
  color: #c0c0c0;
}

.file-edit-text strong {
  color: #9cdcfe;
}

.file-edit-buttons {
  display: flex;
  gap: 6px;
}

.file-edit-btn {
  padding: 4px 12px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.file-edit-btn.keep {
  background: #2d5a27;
  color: #7fff7f;
}

.file-edit-btn.keep:hover {
  background: #4d8a47;
}

.file-edit-btn.revert {
  background: #5a2727;
  color: #ff7f7f;
}

.file-edit-btn.revert:hover {
  background: #8a4747;
}

.file-edit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
`;

export default PendingBackups;
