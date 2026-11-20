import { createContext, useContext } from 'react';

/**
 * The grid classes a block's `responsive.columns` asks for, handed down by
 * BlockRenderer so a grid block adds them to its own grid element with one
 * line and needs to know nothing about the envelope.
 */
export const BlockResponsiveGridContext = createContext('');

export function useResponsiveGrid(): string {
  return useContext(BlockResponsiveGridContext);
}
