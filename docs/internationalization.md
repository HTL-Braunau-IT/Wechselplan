# Internationalization (i18n)

This project uses Next.js App Router's built-in internationalization support with a dictionary-based approach for translations.

## Setup

1. Translation files are stored in `public/locales/{lang}/common.json`
2. Supported languages: English (en) and German (de)
3. The language is part of the URL path (e.g., `/en/about`, `/de/about`)

## Implementation Details

### Dictionary Type

```typescript
type Dictionary = {
  common: {
    welcome: string
    settings: string
    language: string
    theme: string
    dark: string
    light: string
    system: string
    schoolYear: string
  }
  navigation: {
    home: string
    dashboard: string
    profile: string
    logout: string
    schedules: string
    students: string
    menu: string
    closeMenu: string
  }
  auth: {
    login: string
    register: string
    email: string
    password: string
    forgotPassword: string
    rememberMe: string
  }
  errors: {
    required: string
    invalidEmail: string
    passwordTooShort: string
    somethingWentWrong: string
  }
}
```

### Using Translations

1. In Server Components:
```typescript
// Get dictionary
const dict = await getDictionary(lang)

// Use translations
<h1>{dict.common.welcome}</h1>
```

2. In Client Components:
```typescript
// Pass dictionary as props
interface Props {
  dict: Dictionary
}

export function Component({ dict }: Props) {
  return <h1>{dict.common.welcome}</h1>
}
```

### Important Notes

1. Always await the entire `params` object before accessing its properties:
```typescript
const resolvedParams = await Promise.resolve(params)
const dict = await getDictionary(resolvedParams.lang)
```

2. The language switcher component handles URL updates automatically
3. Translations are loaded server-side for better performance
4. Type safety is ensured through the Dictionary type

## Adding New Languages

1. Create a new directory in `public/locales` (e.g., `fr` for French)
2. Copy the structure from `common.json`
3. Add translations
4. Update the `dictionaries` object in `src/lib/dictionary.ts`

## Best Practices

1. Keep translation keys organized by feature/component
2. Use TypeScript for type safety
3. Always await params in dynamic routes
4. Use server components when possible for better performance
5. Keep translations in sync across all language files 