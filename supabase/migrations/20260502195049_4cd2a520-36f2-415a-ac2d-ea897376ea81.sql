-- Remove deprecated duplicate skills replaced by receive_purchase_order
DELETE FROM public.agent_automations WHERE skill_name IN ('receive_goods', 'record_goods_receipt');
DELETE FROM public.agent_skills WHERE name IN ('receive_goods', 'record_goods_receipt');