/**
 * The full lucide icon map, reachable ONLY through a dynamic import.
 *
 * Its own file on purpose: `import('lucide-react')` would ask Rollup for the
 * whole module namespace of a package the app also imports statically, and the
 * whole set would land back in the main chunk. Importing this file dynamically
 * gives the icon set a chunk of its own.
 */
export { icons } from 'lucide-react';
