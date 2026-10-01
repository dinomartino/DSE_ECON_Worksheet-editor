import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import { PLATFORM_MESSAGES } from './messages';

/** `PLATFORM_MESSAGES` in the interface language now. */
export const platformMessages = () => resolveMessages(PLATFORM_MESSAGES, uiLanguage());
