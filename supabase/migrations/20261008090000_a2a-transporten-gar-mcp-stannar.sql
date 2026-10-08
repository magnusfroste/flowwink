-- A2A-transporten går. MCP stannar.
--
-- FlowWink är verksamhetens delade operativa yta: FlowPilot är inbyggd, alla
-- andra agenter ansluter över MCP. A2A var ett andra protokoll för samma sak —
-- peer-till-peer-chatt och förfrågningar mellan instanser med egna in- och
-- utgående tokens, en upptäcktssida (agent-card), en egen aktivitetslogg och en
-- riktningsledger. Komplext nog att skrämma i dörren, och det enda utgående
-- fallet (inköp som förhandlar med leverantörers agenter) är FlowWink som
-- MCP-klient, inte ett eget protokoll.
--
-- Borttaget i samma PR: edge-funktionerna a2a och agent-card, skillarna a2a_chat
-- och a2a_request, Federation-sidan med testchatt, kanaler och inbjudningsträd.
--
-- Databasen: federation_connections (riktningsledgern per peer) hade en skrivare
-- (inbjudan) och en läsare (gatewayens "vem opererar instansen"); båda läser nu
-- a2a_peers direkt. Tabellen släpps. a2a_peers STANNAR som agentregistret (namn,
-- ägare, klient, nyckel, uppdrag) och a2a_activity stannar som OpenClaws
-- utbyteslogg — tråden ligger kvar, bara storyn byter namn.

DROP TABLE IF EXISTS public.federation_connections;
