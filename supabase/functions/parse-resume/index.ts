import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { resume_text } = await req.json();

    if (!resume_text || resume_text.length < 20) {
      return new Response(
        JSON.stringify({ success: false, error: 'Resume text is required (min 20 chars)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are an expert resume parser. Extract structured profile data from the resume text provided.

Return ONLY valid JSON with this exact structure (use null for fields you cannot determine):
{
  "name": "Full Name",
  "title": "Job Title / Professional Title",
  "email": "email@example.com",
  "phone": "+46...",
  "skills": ["Skill1", "Skill2", "Skill3"],
  "experience_years": 5,
  "summary": "A 2-3 sentence professional summary based on the resume",
  "bio": "A longer paragraph about the person's background",
  "languages": ["English", "Swedish"],
  "certifications": ["AWS Certified", "PMP"],
  "linkedin_url": "https://linkedin.com/in/...",
  "portfolio_url": "https://...",
  "experience_json": [
    {
      "company": "Company Name",
      "role": "Job Title",
      "period": "2020-2023",
      "description": "Brief description of role"
    }
  ],
  "education": [
    {
      "institution": "University Name",
      "degree": "BSc Computer Science",
      "year": "2018"
    }
  ]
}

Rules:
- Extract ALL skills mentioned (technologies, tools, methodologies, soft skills)
- Calculate experience_years from the earliest work experience to now
- Write the summary yourself based on the resume content - do NOT copy verbatim
- If a field is not found in the resume, use null (for strings) or empty array (for arrays)
- For experience_json, include the most recent 5-10 positions
- Return ONLY the JSON, no markdown or explanation`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n## Resume Text\n${resume_text.slice(0, 30000)}` }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'AI parsing failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return new Response(
        JSON.stringify({ success: false, error: 'No response from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the JSON response
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return new Response(
      JSON.stringify({ success: true, profile: parsed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('parse-resume error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
