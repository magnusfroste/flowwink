# Contributing to FlowWink

Thank you for your interest in contributing to FlowWink! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork
3. Follow the setup instructions in [SETUP.md](./SETUP.md)
4. Create a branch for your changes

## Development Workflow

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring

Example: `feature/add-image-gallery-block`

### Commit Messages

Follow conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Example:
```
feat(blocks): add image gallery block with lightbox

- Supports up to 12 images
- Responsive grid layout
- Optional captions
```

---

## Database Migrations

### Writing Safe Migrations

All migrations MUST be idempotent (safe to run multiple times).

#### ✅ DO: Use IF NOT EXISTS

```sql
-- Creating tables
CREATE TABLE IF NOT EXISTS public.my_table (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Adding columns
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'my_table' 
    AND column_name = 'new_column'
  ) THEN
    ALTER TABLE public.my_table ADD COLUMN new_column TEXT;
  END IF;
END $$;
```

#### ✅ DO: Use CREATE OR REPLACE for functions

```sql
CREATE OR REPLACE FUNCTION public.my_function()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### ✅ DO: Use DROP IF EXISTS before CREATE for triggers

```sql
DROP TRIGGER IF EXISTS my_trigger ON public.my_table;
CREATE TRIGGER my_trigger
  BEFORE UPDATE ON public.my_table
  FOR EACH ROW
  EXECUTE FUNCTION public.my_function();
```

#### ✅ DO: Add RLS policies safely

```sql
-- Drop existing policy if it exists, then create
DROP POLICY IF EXISTS "Users can view own data" ON public.my_table;
CREATE POLICY "Users can view own data" 
  ON public.my_table 
  FOR SELECT 
  USING (auth.uid() = user_id);
```

#### ❌ DON'T: Use plain CREATE (will fail if exists)

```sql
-- BAD: Will fail on second run
CREATE TABLE public.my_table (...);

-- BAD: Will fail if column exists
ALTER TABLE public.my_table ADD COLUMN new_column TEXT;
```

#### ❌ DON'T: Delete user data without explicit migration

```sql
-- BAD: Never do this in a normal migration
DROP TABLE public.user_data;
TRUNCATE public.important_table;
DELETE FROM public.settings;
```

### Migration File Structure

```sql
-- ============================================
-- Migration: Brief description
-- Version: x.x.x
-- Date: YYYY-MM-DD
-- Safe to re-run: Yes
-- ============================================

-- Description of what this migration does
-- and why it's needed.

-- 1. Create new tables
CREATE TABLE IF NOT EXISTS ...

-- 2. Add new columns
DO $$ BEGIN ... END $$;

-- 3. Create/update functions
CREATE OR REPLACE FUNCTION ...

-- 4. Create triggers
DROP TRIGGER IF EXISTS ...
CREATE TRIGGER ...

-- 5. Add RLS policies
ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ...
CREATE POLICY ...

-- 6. Insert default data (if needed)
INSERT INTO ... 
ON CONFLICT DO NOTHING;
```

### Testing Migrations

Before submitting:

1. Run migration on a fresh database
2. Run migration twice (should not error)
3. Verify existing data is preserved
4. Test affected functionality

---

## Code Style

### TypeScript

- Use TypeScript for all new code
- Define proper types (avoid `any`)
- Use functional components with hooks

### React Components

```tsx
// Good: Focused, single-responsibility component
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export function Button({ label, onClick, variant = 'primary' }: ButtonProps) {
  return (
    <button 
      className={cn('btn', variant === 'primary' ? 'btn-primary' : 'btn-secondary')}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
```

### File Organization

- Components: `src/components/`
- Hooks: `src/hooks/`
- Pages: `src/pages/`
- Utils: `src/lib/`
- Types: `src/types/`

### Styling

- Use Tailwind CSS
- Use design system tokens (not raw colors)
- Keep components responsive

```tsx
// Good: Uses design tokens
<div className="bg-background text-foreground border-border">

// Bad: Raw colors
<div className="bg-white text-black border-gray-200">
```

---

## Pull Request Process

1. **Create PR** against `main` branch
2. **Fill out template** with description of changes
3. **Ensure all checks pass**
4. **Request review** if needed
5. **Address feedback**
6. **Squash and merge** when approved

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Migrations are idempotent
- [ ] No breaking changes (or documented)
- [ ] Updated relevant documentation
- [ ] Tested locally

---

## Reporting Issues

### Bug Reports

Include:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Browser/environment info
- Screenshots if applicable

### Feature Requests

Include:
- Use case description
- Proposed solution
- Alternatives considered

---

## Questions?

Open a GitHub Discussion for:
- Help with setup
- General questions
- Feature ideas
- Showing off what you've built

Thank you for contributing! 🎉
