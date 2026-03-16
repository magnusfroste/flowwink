-- Replace old reactive objectives with proactive Day 1 objectives

UPDATE agent_objectives 
SET status = 'failed'
WHERE status = 'active'
AND (goal LIKE '%inbound client briefs%' OR goal LIKE '%inbound consultant applications%' OR goal LIKE '%availability and competency queries%');

INSERT INTO agent_objectives (goal, status, constraints, success_criteria, progress) VALUES
('Day 1: Research the IT consulting market — identify top 5 competitors, define our ICP, and document industry trends', 'active', '{"priority": "critical"}', '{"memory_keys": ["company_research", "competitor_analysis"]}', '{"source": "day1_playbook", "goal_type": "research"}'),
('Write and publish 2 blog posts targeting our ICP: one about technology trends, one consultant hiring guide', 'active', '{"priority": "high"}', '{"published_posts": 2}', '{"source": "day1_playbook", "goal_type": "content"}'),
('SEO audit all published pages — fix meta titles, descriptions, and heading structure', 'active', '{"priority": "high"}', '{"pages_audited": "all", "seo_score_avg": 80}', '{"source": "day1_playbook", "goal_type": "seo"}'),
('Research and build a prospect pipeline of 10 companies that need IT consulting services in the Nordics', 'active', '{"priority": "medium"}', '{"prospects_found": 10, "leads_created": 5}', '{"source": "day1_playbook", "goal_type": "prospecting"}'),
('Create a 4-week content calendar with blog topics, newsletter themes, and social post ideas', 'active', '{"priority": "medium"}', '{"content_proposals": 8}', '{"source": "day1_playbook", "goal_type": "content_planning"}');