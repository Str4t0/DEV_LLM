// frontend/src/components/LogWindow.tsx

import React from "react";

// Dátum + idő formázás
const formatDateTime = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;
};

export interface LogMessage {
  id: string;
  timestamp: Date;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

interface LogWindowProps {
  messages: LogMessage[];
}

export const LogWindow: React.FC<LogWindowProps> = ({ messages }) => {
  const logRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll az utolsó üzenethez
  React.useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  const getLevelIcon = (level: LogMessage["level"]) => {
    switch (level) {
      case "success":
        return "✅";
      case "warning":
        return "⚠️";
      case "error":
        return "❌";
      default:
        return "ℹ️";
    }
  };

  const getLevelClass = (level: LogMessage["level"]) => {
    return `log-message log-${level}`;
  };

  return (
    <div className="log-window-content" ref={logRef}>
      {messages.length === 0 ? (
        <div className="log-empty">Nincs üzenet</div>
      ) : (
        messages.map((msg) => (
          <div key={msg.id} className={getLevelClass(msg.level)}>
            <span className="log-timestamp">
              {formatDateTime(msg.timestamp)}
            </span>
            <span className="log-icon">{getLevelIcon(msg.level)}</span>
            <span className="log-text">{msg.message}</span>
          </div>
        ))
      )}
    </div>
  );
};

