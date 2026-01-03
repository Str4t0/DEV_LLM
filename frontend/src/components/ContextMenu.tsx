// frontend/src/components/ContextMenu.tsx
import React, { useEffect, useRef, useCallback, useState } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  onClick?: () => void;
  divider?: boolean;
  danger?: boolean;
  disabled?: boolean;
  submenu?: ContextMenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  // Pozíció korrekció hogy ne lógjon ki a képernyőről
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newX = x;
      let newY = y;

      // Ha kilóg jobbra
      if (x + rect.width > viewportWidth - 10) {
        newX = viewportWidth - rect.width - 10;
      }
      // Ha kilóg alul
      if (y + rect.height > viewportHeight - 10) {
        newY = viewportHeight - rect.height - 10;
      }
      // Ne menjen negatívba
      newX = Math.max(10, newX);
      newY = Math.max(10, newY);

      setAdjustedPos({ x: newX, y: newY });
    }
  }, [x, y]);

  // Kattintás kívülre bezárja
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ 
        left: adjustedPos.x, 
        top: adjustedPos.y,
        position: 'fixed',
        zIndex: 10000,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        item.divider ? (
          <div key={item.id} className="context-menu-divider" />
        ) : (
          <button
            key={item.id}
            className={`context-menu-item ${item.danger ? 'danger' : ''} ${item.disabled ? 'disabled' : ''}`}
            onClick={() => {
              if (!item.disabled && item.onClick) {
                item.onClick();
                onClose();
              }
            }}
            disabled={item.disabled}
          >
            {item.icon && <span className="context-menu-icon">{item.icon}</span>}
            <span className="context-menu-label">{item.label}</span>
          </button>
        )
      ))}
    </div>
  );
};

// Hook a context menu kezeléséhez
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  context?: any;
}

export function useContextMenu() {
  const [menuState, setMenuState] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    items: [],
    context: null,
  });

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef({ x: 0, y: 0 });

  const showContextMenu = useCallback((
    e: React.MouseEvent | { clientX: number; clientY: number },
    items: ContextMenuItem[],
    context?: any
  ) => {
    if ('preventDefault' in e) {
      e.preventDefault();
      e.stopPropagation();
    }

    setMenuState({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      items,
      context,
    });

    // Haptic feedback mobilon
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  }, []);

  const hideContextMenu = useCallback(() => {
    setMenuState(prev => ({ ...prev, visible: false }));
  }, []);

  // Long press kezelés mobilra
  const handleTouchStart = useCallback((
    e: React.TouchEvent,
    getItems: (context?: any) => ContextMenuItem[],
    context?: any
  ) => {
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };

    longPressTimer.current = setTimeout(() => {
      const items = getItems(context);
      showContextMenu(
        { clientX: touch.clientX, clientY: touch.clientY },
        items,
        context
      );
      longPressTimer.current = null;
    }, 500); // 500ms long press
  }, [showContextMenu]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!longPressTimer.current) return;

    const touch = e.touches[0];
    const distance = Math.sqrt(
      Math.pow(touch.clientX - touchStartPos.current.x, 2) +
      Math.pow(touch.clientY - touchStartPos.current.y, 2)
    );

    // Ha 10px-nél többet mozgott, töröljük a long press-t
    if (distance > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  return {
    menuState,
    showContextMenu,
    hideContextMenu,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}

export default ContextMenu;




