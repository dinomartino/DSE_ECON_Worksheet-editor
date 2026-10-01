import { defineMessages } from '@/i18n/catalogue';

export const STIMULUS_PANEL_MESSAGES = defineMessages({
  leadIn: { en: 'Lead-in', zh: '引言' },
  leadInHint: {
    en: 'the question numbers between the two halves are derived',
    zh: '兩段文字之間的題號會自動產生',
  },
  before: { en: 'Before the numbers', zh: '題號之前' },
  after: { en: 'After the numbers', zh: '題號之後' },
  covered: { en: 'Questions covered', zh: '涵蓋題數' },
  content: { en: 'Stimulus content', zh: '刺激材料內容' },
  contentHint: {
    en: 'what the questions share · typed on the page',
    zh: '各題共用的材料 · 直接在頁面上輸入',
  },
});
