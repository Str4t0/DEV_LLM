// frontend/src/components/SyntaxErrorPanel.tsx

import React from "react";
import type { SyntaxError } from "../utils/pliSyntaxChecker";

interface SyntaxErrorPanelProps {
  errors: SyntaxError[];
  onErrorClick?: (line: number) => void;
  onFixError?: (error: SyntaxError) => void;
  onFixAllErrors?: () => void;
  onClose?: () => void;
  isFixing?: boolean;
}

export const SyntaxErrorPanel: React.FC<SyntaxErrorPanelProps> = ({
  errors,
  onErrorClick,
  onFixError,
  onFixAllErrors,
  onClose,
  isFixing = false,
}) => {
  if (errors.length === 0) {
    return null;
  }

  // Deduplikálás - ugyanaz a sor + üzenet csak egyszer
  const uniqueErrors = errors.reduce((acc, error) => {
    const key = `${error.line}:${error.message}`;
    if (!acc.some(e => `${e.line}:${e.message}` === key)) {
      acc.push(error);
    }
    return acc;
  }, [] as SyntaxError[]);

  const errorCount = uniqueErrors.filter((e) => e.severity === "error").length;
  const warningCount = uniqueErrors.filter((e) => e.severity === "warning").length;

  return (
    <div className="syntax-error-panel">
      <div className="syntax-error-header">
        <span className="syntax-error-title">
          ⚠️ Szintaxis hibák
        </span>
        <span className="syntax-error-count">
          {errorCount > 0 && (
            <span className="error-count">{errorCount} hiba</span>
          )}
          {warningCount > 0 && (
            <span className="warning-count">{warningCount} figyelmeztetés</span>
          )}
        </span>
        <div className="syntax-error-actions">
          {onFixAllErrors && uniqueErrors.length > 1 && (
            <button 
              className="fix-all-btn" 
              onClick={onFixAllErrors}
              disabled={isFixing}
              title="Minden hiba javítása"
            >
              {isFixing ? "⏳ Javítás..." : "🔧 Mind javítása"}
            </button>
          )}
          {onClose && (
            <button 
              className="close-btn" 
              onClick={onClose}
              title="Panel bezárása"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="syntax-error-list">
        {uniqueErrors.map((error, idx) => (
          <div
            key={`${error.line}-${idx}`}
            className={`syntax-error-item syntax-error-${error.severity}`}
            onClick={() => onErrorClick?.(error.line)}
          >
            <span className="syntax-error-line">:{error.line}</span>
            <span className="syntax-error-message">{error.message}</span>
            {onFixError && (
              <button
                className="syntax-error-fix-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onFixError(error);
                }}
                disabled={isFixing}
                title="Hiba javítása"
              >
                🔧 Fix
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
