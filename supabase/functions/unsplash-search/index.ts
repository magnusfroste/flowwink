import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UnsplashPhoto {
  id: string;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  alt_description: string | null;
  description: string | null;
  user: {
    name: string;
    username: string;
  };
  width: number;
  height: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
    
    if (!accessKey) {
      console.error('UNSPLASH_ACCESS_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Unsplash API key not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { query, page = 1, perPage = 20 } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Searching Unsplash for: "${query}" (page ${page})`);

    const searchUrl = new URL('https://api.unsplash.com/search/photos');
    searchUrl.searchParams.set('query', query);
    searchUrl.searchParams.set('page', String(page));
    searchUrl.searchParams.set('per_page', String(perPage));
    searchUrl.searchParams.set('orientation', 'landscape');

    const response = await fetch(searchUrl.toString(), {
      headers: {
        'Authorization': `Client-ID ${accessKey}`,
        'Accept-Version': 'v1',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Unsplash API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to search Unsplash', details: errorText }),
        { 
          status: response.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const data = await response.json();
    
    const photos = data.results.map((photo: UnsplashPhoto) => ({
      id: photo.id,
      url: photo.urls.regular,
      thumbUrl: photo.urls.small,
      alt: photo.alt_description || photo.description || 'Unsplash photo',
      photographer: photo.user.name,
      photographerUrl: `https://unsplash.com/@${photo.user.username}?utm_source=cms&utm_medium=referral`,
      width: photo.width,
      height: photo.height,
    }));

    console.log(`Found ${photos.length} photos for query "${query}"`);

    return new Response(
      JSON.stringify({ 
        photos,
        total: data.total,
        totalPages: data.total_pages,
        page,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: unknown) {
    console.error('Error in unsplash-search:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
