import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (openaiKey) {
      const resp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000), dimensions: 768 }),
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.data?.[0]?.embedding || null;
      }
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (geminiKey) {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text: text.slice(0, 8000) }] },
            outputDimensionality: 768,
          }),
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        return data.embedding?.values || null;
      }
    }

    return null;
  } catch (err) {
    console.error('[backfill-embeddings] Embedding generation failed:', err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch memories without embeddings
    const { data: memories, error } = await supabase
      .from('agent_memory')
      .select('id, key, value, category')
      .is('embedding', null)
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!memories?.length) {
      return new Response(JSON.stringify({ status: 'ok', message: 'All memories already have embeddings', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: { id: string; key: string; success: boolean }[] = [];
    let successCount = 0;

    for (const mem of memories) {
      const text = `${mem.key}: ${typeof mem.value === 'string' ? mem.value : JSON.stringify(mem.value)}`;
      const embedding = await generateEmbedding(text);

      if (embedding) {
        const { error: updateError } = await supabase
          .from('agent_memory')
          .update({ embedding: JSON.stringify(embedding) })
          .eq('id', mem.id);

        const success = !updateError;
        if (success) successCount++;
        results.push({ id: mem.id, key: mem.key, success });
        if (updateError) console.error(`[backfill] Failed to update ${mem.key}:`, updateError);
      } else {
        results.push({ id: mem.id, key: mem.key, success: false });
      }

      // Rate limit: 100ms between calls
      await new Promise(r => setTimeout(r, 100));
    }

    return new Response(JSON.stringify({
      status: 'ok',
      total: memories.length,
      success: successCount,
      failed: memories.length - successCount,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[backfill-embeddings] Error:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
