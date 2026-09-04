-- "AI chat"-flaggan gatade inget — demoseeden sa motsatsen.
-- include_in_chat var en etikett: indexet läser publicerad + publik, inget
-- annat, och ingen konsument filtrerade på flaggan. Etiketten och knapparna
-- är borta ur UI:t; kolumnen står kvar (ofarlig). Demoartikeln som lärde ut
-- flaggan får sanningen i stället.
UPDATE public.kb_articles
SET title = 'Published but internal — the audience dial',
    question = 'Can an article be published and still stay out of the visitor chat?',
    answer_text = 'Yes — by audience, not by a chat switch. Every published article has an audience: Public articles ground the visitor chat and FlowPilot''s mail replies; Internal articles are visible to staff and staff-facing agents only. Set it in the article editor under Visibility. (An older "Include in AI Chat" flag existed but never gated anything; it is gone from the UI.)'
WHERE slug = 'demo-not-in-chat';
