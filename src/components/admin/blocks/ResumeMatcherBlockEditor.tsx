import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ResumeMatcherBlock } from '@/components/public/blocks/ResumeMatcherBlock';

interface ResumeMatcherBlockData {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  buttonText?: string;
}

interface ResumeMatcherBlockEditorProps {
  data: ResumeMatcherBlockData;
  onChange: (data: ResumeMatcherBlockData) => void;
  isEditing?: boolean;
}

export function ResumeMatcherBlockEditor({ data, onChange, isEditing }: ResumeMatcherBlockEditorProps) {
  const handleChange = (key: keyof ResumeMatcherBlockData, value: string) => {
    onChange({ ...data, [key]: value });
  };

  // Preview mode — render the REAL public block so search actually works
  if (!isEditing) {
    return <ResumeMatcherBlock data={data} />;
  }

  // Edit mode
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={data.title || ''}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="Find the Perfect Consultant"
        />
      </div>

      <div className="space-y-2">
        <Label>Subtitle</Label>
        <Input
          value={data.subtitle || ''}
          onChange={(e) => handleChange('subtitle', e.target.value)}
          placeholder="Paste a job description and our AI will match you with the best consultant."
        />
      </div>

      <div className="space-y-2">
        <Label>Textarea Placeholder</Label>
        <Input
          value={data.placeholder || ''}
          onChange={(e) => handleChange('placeholder', e.target.value)}
          placeholder="Paste the job description or assignment brief here..."
        />
      </div>

      <div className="space-y-2">
        <Label>Button Text</Label>
        <Input
          value={data.buttonText || ''}
          onChange={(e) => handleChange('buttonText', e.target.value)}
          placeholder="Find Match"
        />
      </div>
    </div>
  );
}
