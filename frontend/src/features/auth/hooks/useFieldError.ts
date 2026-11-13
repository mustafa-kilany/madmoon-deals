// Form validation messages are i18n keys ("validation.emailInvalid");
// this turns a react-hook-form field error into translated text.

import type { FieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type en from '@/i18n/en.json';

type ValidationKey = `validation.${keyof typeof en.validation}`;

export function useFieldError(): (error?: FieldError) => string | undefined {
  const { t } = useTranslation();
  return error =>
    error?.message ? t(error.message as ValidationKey) : undefined;
}
