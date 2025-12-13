import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { EditorView } from '@codemirror/view';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}

const theme = EditorView.theme({
  '&': {
    fontSize: '13px',
    border: '1px solid hsl(var(--border))',
    borderRadius: 'calc(var(--radius) - 2px)',
  },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    padding: '8px 0',
  },
  '.cm-line': {
    padding: '0 12px',
  },
  '&.cm-focused': {
    outline: '2px solid hsl(var(--ring))',
    outlineOffset: '-1px',
  },
  '.cm-gutters': {
    backgroundColor: 'hsl(var(--muted))',
    borderRight: '1px solid hsl(var(--border))',
    color: 'hsl(var(--muted-foreground))',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'hsl(var(--accent))',
  },
  '.cm-activeLine': {
    backgroundColor: 'hsl(var(--accent) / 0.3)',
  },
  '.cm-placeholder': {
    color: 'hsl(var(--muted-foreground))',
    fontStyle: 'italic',
  },
});

export function CodeEditor({ value, onChange, placeholder, minHeight = '150px' }: CodeEditorProps) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={[html(), EditorView.lineWrapping]}
      theme={theme}
      placeholder={placeholder}
      minHeight={minHeight}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: true,
        highlightActiveLine: true,
        foldGutter: false,
        dropCursor: true,
        allowMultipleSelections: false,
        indentOnInput: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: false,
        rectangularSelection: false,
        crosshairCursor: false,
        highlightSelectionMatches: false,
        searchKeymap: false,
      }}
    />
  );
}
