
# Chat Launcher - ChatGPT/Claude-liknande Startupplevelse

## Koncept

Skapa en **diskret chat-launcher** på startsidan som vid första interaktion routar användaren till `/chat` - precis som ChatGPT, Claude och Grok gör. Detta blir ett alternativ till det befintliga "embedded block"-läget.

```text
+------------------------------------------+
|  [Navigation]                            |
+------------------------------------------+
|                                          |
|     [Hero Block - normal content]        |
|                                          |
+------------------------------------------+
|                                          |
|         What can I help you with?        |
|                                          |
|    +-------------------------------+     |
|    |  Message AI Assistant...      | ->  |
|    +-------------------------------+     |
|                                          |
|    [Quick Action] [Quick Action] [...]   |
|                                          |
+------------------------------------------+
|     [Footer]                             |
+------------------------------------------+
```

Vid klick eller första meddelande -> navigerar till `/chat` med meddelandet förifyllt.

---

## Flöde

1. **Användaren ser launcher** - diskret sökfältsliknande komponent
2. **Klickar/skriver** - navigeras direkt till `/chat`  
3. **Om meddelande skrevs** - skickas automatiskt som första prompt
4. **Meny finns i header** - enkelt att navigera tillbaka

---

## Implementation

### Ny komponent: `ChatLauncherBlock`

```text
src/components/public/blocks/ChatLauncherBlock.tsx
```

- Modern, centrerad design (Apple-inspirerad)
- Input-fält med placeholder
- 2-4 snabbval (suggested prompts från Chat Settings)
- Vid Enter/klick -> `navigate('/chat', { state: { initialMessage } })`

### Ny blocktyp i CMS

```text
src/types/cms.ts - Lägg till 'chat-launcher' i ContentBlockType
```

**ChatLauncherBlockData:**
- `title`: Rubrik (t.ex. "How can I help you today?")
- `subtitle`: Underrubrik (valfri)
- `placeholder`: Input placeholder
- `showQuickActions`: boolean
- `quickActionCount`: 2-4 (hur många prompts visas)
- `variant`: 'minimal' | 'card' | 'hero-integrated'

### Editor: `ChatLauncherBlockEditor`

```text
src/components/admin/blocks/ChatLauncherBlockEditor.tsx
```

### Uppdatera `/chat` för att ta emot initialMessage

```text
src/pages/ChatPage.tsx
```

- Läs `location.state?.initialMessage` 
- Skicka automatiskt som första meddelande om det finns

### Uppdatera BlockRenderer och BlockSelector

Registrera den nya blocktypen.

---

## Konfiguration

Använder befintliga **Chat Settings**:
- `suggestedPrompts` - för quick actions
- `title` / `welcomeMessage` - kan återanvändas
- `landingPageEnabled` - måste vara `true` för att launcher ska fungera

---

## Teknisk sammanfattning

| Fil | Ändring |
|-----|---------|
| `src/types/cms.ts` | Ny blocktyp `chat-launcher` + `ChatLauncherBlockData` |
| `src/components/public/blocks/ChatLauncherBlock.tsx` | **Ny** - renderar launcher UI |
| `src/components/admin/blocks/ChatLauncherBlockEditor.tsx` | **Ny** - admin editor |
| `src/components/admin/blocks/BlockSelector.tsx` | Registrera blocktypen |
| `src/components/public/BlockRenderer.tsx` | Registrera rendering |
| `src/pages/ChatPage.tsx` | Hantera `initialMessage` från navigation state |
| `docs/PRD.md` | Dokumentera nya komponenten |

---

## Fördelar

- **Ingen extra route** - använder befintliga `/chat`
- **Flexibelt** - kan placeras var som helst på sidan som ett block
- **Konsistent** - delar inställningar med övriga chat-funktioner
- **Modernt UX** - känns som ChatGPT/Claude

