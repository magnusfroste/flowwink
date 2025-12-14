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
    const { imageUrl, fileName } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'imageUrl krävs' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing image:', imageUrl);

    // Fetch the image
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CMSBot/1.0)',
      },
    });

    if (!imageResponse.ok) {
      throw new Error(`Kunde inte hämta bilden: ${imageResponse.status}`);
    }

    const contentType = imageResponse.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      throw new Error('URL:en pekar inte på en bild');
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    console.log('Downloaded image, size:', imageBuffer.byteLength);

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const baseName = fileName 
      ? fileName.replace(/\.[^/.]+$/, '') // Remove extension
      : `imported-${randomStr}`;
    
    // For now, we keep the original format since Deno doesn't have native WebP encoding
    // The conversion to WebP will happen client-side before upload
    const originalExt = contentType.split('/')[1]?.split(';')[0] || 'jpg';
    const finalFileName = `imports/${timestamp}-${baseName}.${originalExt}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('cms-images')
      .upload(finalFileName, imageBuffer, {
        contentType: contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Uppladdning misslyckades: ${uploadError.message}`);
    }

    console.log('Uploaded to:', finalFileName);

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('cms-images')
      .getPublicUrl(finalFileName);

    console.log('Public URL:', publicUrl);

    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrl,
        originalUrl: imageUrl,
        fileName: finalFileName,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Bildbearbetning misslyckades';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
