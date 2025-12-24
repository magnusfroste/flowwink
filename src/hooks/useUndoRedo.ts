import { useReducer, useCallback, useRef } from 'react';

interface UndoRedoState<T> {
  past: T[];
  present: T;
  future: T[];
}

type Action<T> =
  | { type: 'SET'; payload: T }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET'; payload: T }
  | { type: 'CLEAR' };

function undoRedoReducer<T>(state: UndoRedoState<T>, action: Action<T>): UndoRedoState<T> {
  switch (action.type) {
    case 'SET': {
      // Don't add to history if the value is the same
      if (JSON.stringify(state.present) === JSON.stringify(action.payload)) {
        return state;
      }
      return {
        past: [...state.past, state.present],
        present: action.payload,
        future: [],
      };
    }
    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      return {
        past: newPast,
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      return {
        past: [...state.past, state.present],
        present: next,
        future: newFuture,
      };
    }
    case 'RESET': {
      return {
        past: [],
        present: action.payload,
        future: [],
      };
    }
    case 'CLEAR': {
      return {
        past: [],
        present: state.present,
        future: [],
      };
    }
    default:
      return state;
  }
}

export interface UseUndoRedoOptions<T> {
  initialValue: T;
  maxHistory?: number;
}

export interface UseUndoRedoReturn<T> {
  present: T;
  set: (value: T) => void;
  undo: () => void;
  redo: () => void;
  reset: (value: T) => void;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  historyLength: number;
}

export function useUndoRedo<T>({ initialValue, maxHistory = 50 }: UseUndoRedoOptions<T>): UseUndoRedoReturn<T> {
  const [state, dispatch] = useReducer(undoRedoReducer<T>, {
    past: [],
    present: initialValue,
    future: [],
  });

  // Use a ref to track the initial value for comparison
  const initialRef = useRef(initialValue);

  const set = useCallback((value: T) => {
    dispatch({ type: 'SET', payload: value });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const reset = useCallback((value: T) => {
    initialRef.current = value;
    dispatch({ type: 'RESET', payload: value });
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  // Trim history if it exceeds maxHistory
  const trimmedPast = state.past.length > maxHistory 
    ? state.past.slice(-maxHistory) 
    : state.past;

  return {
    present: state.present,
    set,
    undo,
    redo,
    reset,
    clear,
    canUndo: trimmedPast.length > 0,
    canRedo: state.future.length > 0,
    historyLength: trimmedPast.length,
  };
}
