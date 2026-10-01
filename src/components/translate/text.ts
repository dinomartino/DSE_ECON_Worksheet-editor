import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import { COPY_MESSAGES } from './messages';

/** `COPY_MESSAGES` in the interface language now. */
export const copyMessages = () => resolveMessages(COPY_MESSAGES, uiLanguage());
/** The English text, for the constants other modules still import by name. */
export const COPY_EN = resolveMessages(COPY_MESSAGES, 'en');
