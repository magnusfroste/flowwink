UPDATE api_keys ak
SET key_raw = p.mcp_api_key
FROM a2a_peers p
WHERE p.api_key_id = ak.id
  AND ak.key_raw IS NULL
  AND p.mcp_api_key IS NOT NULL
  AND p.mcp_api_key LIKE 'fwk_%';

UPDATE api_keys ak
SET key_raw = p.mcp_api_key
FROM a2a_peers p
WHERE ak.key_raw IS NULL
  AND p.mcp_api_key IS NOT NULL
  AND p.mcp_api_key LIKE ak.key_prefix || '%'
  AND ak.name LIKE 'MCP key for peer%';