import { defineMessages } from '@/i18n/catalogue';

/** The note over a document printed from Export → Whole set (`printJob.tsx`). */
export const PRINT_JOB_MESSAGES = defineMessages({
  printing: { en: (what: string) => `Printing ${what}…`, zh: (what: string) => `正在列印${what}…` },
});
