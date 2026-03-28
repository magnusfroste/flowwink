
-- Fix broken Supabase storage URLs in about page
UPDATE pages
SET content_json = REPLACE(
  REPLACE(
    content_json::text,
    'https://rzhjotxffjfsdlhrdkpj.supabase.co/storage/v1/object/public/cms-images/templates/1774660789670-our-team.jpg',
    '/templates/misc/our-team.jpg'
  ),
  'https://rzhjotxffjfsdlhrdkpj.supabase.co/storage/v1/object/public/cms-images/templates/1774660789678-team-brainstorming.jpg',
  '/templates/blog/team-brainstorming.jpg'
)::jsonb
WHERE slug = 'about';

-- Fix remaining broken URLs in home page
UPDATE pages
SET content_json = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(
            content_json::text,
            'https://rzhjotxffjfsdlhrdkpj.supabase.co/storage/v1/object/public/cms-images/templates/1774660788378-creator-toolkit.jpg',
            '/templates/products/creator-toolkit.jpg'
          ),
          'https://rzhjotxffjfsdlhrdkpj.supabase.co/storage/v1/object/public/cms-images/templates/1774660788397-digital-shop-hero.jpg',
          '/templates/hero/digital-shop-hero.jpg'
        ),
        'https://rzhjotxffjfsdlhrdkpj.supabase.co/storage/v1/object/public/cms-images/templates/1774660788433-modern-office.jpg',
        '/templates/hero/modern-office.jpg'
      ),
      'https://rzhjotxffjfsdlhrdkpj.supabase.co/storage/v1/object/public/cms-images/templates/1774660789055-design-system-pro.jpg',
      '/templates/products/design-system-pro.jpg'
    ),
    'https://rzhjotxffjfsdlhrdkpj.supabase.co/storage/v1/object/public/cms-images/templates/1774660789063-money-growth.jpg',
    '/templates/misc/money-growth.jpg'
  ),
  'https://rzhjotxffjfsdlhrdkpj.supabase.co/storage/v1/object/public/cms-images/templates/1774660789069-growth-masterclass.jpg',
  '/templates/products/growth-masterclass.jpg'
)::jsonb
WHERE slug = 'home';
