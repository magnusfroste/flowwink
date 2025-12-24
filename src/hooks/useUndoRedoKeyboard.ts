import { useEffect, useCallback } from 'react';

interface UseUndoRedoKeyboardOptions {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  enabled?: boolean;
}

export function useUndoRedoKeyboard({
  undo,
  redo,
  canUndo,
  canRedo,
  enabled = true,
}: UseUndoRedoKeyboardOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Check if we're in an input/textarea that should handle its own undo/redo
      const target = event.target as HTMLElement;
      const isTextInput = 
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Skip if inside a text input - let the input handle its own undo/redo
      if (isTextInput) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;

      if (!ctrlKey) return;

      // Undo: Ctrl+Z / Cmd+Z (without shift)
      if (event.key === 'z' && !event.shiftKey && canUndo) {
        event.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y
      if (
        (event.key === 'z' && event.shiftKey && canRedo) ||
        (event.key === 'y' && canRedo)
      ) {
        event.preventDefault();
        redo();
        return;
      }
    },
    [undo, redo, canUndo, canRedo, enabled]
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, enabled]);
}
