import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'imageUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching image:', imageUrl);

    // Fetch the image
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CMSBot/1.0)',
        'Accept': 'image/*',
      },
    });

    if (!imageResponse.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to fetch image: ${imageResponse.status}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    
    // Read image as array buffer and convert to base64
    const imageBuffer = await imageResponse.arrayBuffer();
    const bytes = new Uint8Array(imageBuffer);
    
    // Convert to base64
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64 = btoa(binary);

    console.log('Successfully fetched image, size:', bytes.length, 'bytes');

    return new Response(
      JSON.stringify({
        success: true,
        base64,
        contentType,
        size: bytes.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch image';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
