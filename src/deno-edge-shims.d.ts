// Ambient shims so the frontend TypeScript checker doesn't error on
// Deno-only edge-function code. Runtime is Deno; these types are inert there.
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (...args: unknown[]) => unknown;
  [key: string]: any;
};

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js';
}
declare module 'https://esm.sh/*';
declare module 'npm:*';
