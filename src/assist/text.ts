import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import { ASSIST_MESSAGES } from './messages';

/** `ASSIST_MESSAGES` in the interface language now; read when a verb is offered or run. */
export const assistMessages = () => resolveMessages(ASSIST_MESSAGES, uiLanguage());
/** The English text, for the constants other modules still import by name. */
export const ASSIST_EN = resolveMessages(ASSIST_MESSAGES, 'en');
