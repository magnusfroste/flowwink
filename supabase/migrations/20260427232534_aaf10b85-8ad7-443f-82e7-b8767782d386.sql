UPDATE public.agent_skills 
SET tool_definition = $JSON${
  "type": "function",
  "function": {
    "name": "manage_document",
    "description": "CRUD for the document archive. action=create REQUIRES title + file_url + file_name (file_name auto-defaults to title if omitted). For PDFs uploaded to chat, pass the public URL as file_url. Aliases accepted: mime_type→file_type, size_bytes→file_size_bytes, storage_path/url→file_url, name/filename→file_name. Body/markdown content is NOT stored — only the file at file_url.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": { "type": "string", "enum": ["create", "search", "list", "get", "update", "delete", "categorize"] },
        "document_id": { "type": "string", "description": "Required for get/update/delete" },
        "id": { "type": "string", "description": "Alias for document_id" },
        "title": { "type": "string", "description": "Required for create — short human-readable name" },
        "file_url": { "type": "string", "description": "Required for create — public URL or storage path of the file. Aliases accepted: storage_path, url, path." },
        "file_name": { "type": "string", "description": "Optional for create — defaults to title if omitted. Aliases: name, filename." },
        "file_type": { "type": "string", "description": "MIME type, e.g. application/pdf. Aliases: mime_type, content_type." },
        "file_size_bytes": { "type": "number", "description": "File size in bytes. Aliases: size_bytes, file_size." },
        "category": { "type": "string", "enum": ["general", "contract", "hr", "finance", "project"], "description": "Required for create — choose the closest match." },
        "folder": { "type": "string" },
        "tags": { "type": "array", "items": { "type": "string" } },
        "description": { "type": "string", "description": "Notes / summary of the document" },
        "related_entity_type": { "type": "string", "description": "e.g. contract, employee, project, deal" },
        "related_entity_id": { "type": "string" },
        "search_query": { "type": "string" }
      },
      "required": ["action"],
      "allOf": [
        {
          "if": { "properties": { "action": { "const": "create" } } },
          "then": { "required": ["action", "title", "file_url", "category"] }
        }
      ]
    }
  }
}$JSON$::jsonb,
    instructions = 'Central document store. action=create REQUIRES title + file_url + category; file_name auto-fills from title. Categories: contract->Contracts, hr->HR, finance->Expenses/Invoicing, project->Projects. The body/markdown of the document is NOT stored — only the file URL.'
WHERE name = 'manage_document';