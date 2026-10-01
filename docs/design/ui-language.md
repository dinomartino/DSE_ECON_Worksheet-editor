# Interface language: English / 繁體中文 (香港)

Status: building, 2026-10-02. Asked by the user: an app setting to choose the interface
language, with Hong Kong wording, keeping the terms HK teachers say in English.

## Decisions

- **Chrome only, never the paper.** The setting changes buttons, menus, dialogs, hints and
  notices. Printed text, document defaults (e.g. "Answer ALL questions.") and the editing
  language (EN / 中文 / EN+中) are untouched; a document prints identically in either UI.
- **English is the default, and English mode is today's text exactly.** Existing bilingual
  chrome ("Question 題目", "Question bank 題庫") stays as it is in English mode. In 中文 mode
  it shows the Chinese alone.
- **Settings → Language 語言**: English | 繁體中文. Per browser/computer
  (`econgen.settings.language`), like Appearance. `<html lang>` follows it (`en` / `zh-HK`).
- **What's new follows the setting.** Each CHANGELOG bullet carries its 繁體中文 as a
  `<!-- zh: … -->` comment under it (`docs/RECIPES.md` § Adding a changelog line); 中文
  shows it, English and the GitHub release body never do. AI provider pages and error
  text from outside services pass through untranslated.
- Hong Kong Traditional Chinese: HK vocabulary (軟件 not 軟體, 網上 not 線上, 用戶 not 使用者,
  電郵), full-width punctuation （，。：？！）, `…` kept.

## Terms kept in English (verbatim inside Chinese strings)

Enforced by a test: when an English string contains one of these, its Chinese must too.

| Kind | Terms |
|---|---|
| Exam | DSE, HKDSE, Paper 1, Paper 2, MC, MCQ, LQ, Mock, Section A, Section B, Section C |
| Files and tech | PDF, Word, .docx, .json, .zip, PNG, CSV, Excel, AI, API key, URL, VPN |
| Names | Econ Studio, Gemini, OpenAI, Claude, Qwen, Vertex AI, Mac, Windows, Safari, Chrome |
| Units and keys | A4, A3, Letter, px, pt, cm, in, ⌘, Shift, Esc, Enter, Tab |
| Diagram symbols | D, S, P, Q, AD, AS, MR, AC, AVC, MPC, MSC, MSB (any symbol shown as a label) |

Example: "Paper 1 mock · MCQ" → "Paper 1 Mock · MCQ"; "Download PNG" → "下載 PNG".

## Standard translations

| English | 中文 | English | 中文 |
|---|---|---|---|
| Worksheet | 工作紙 | New worksheet | 新增工作紙 |
| Question bank | 題庫 | Graphs | 圖表庫 |
| Library (start screen) | 資源庫 | Template | 範本 |
| Settings | 設定 | Appearance | 外觀 |
| Language | 語言 | Export | 匯出 |
| Import | 匯入 | Back up | 備份 |
| Restore | 還原 | Trash | 垃圾桶 |
| Folder | 資料夾 | Rename | 重新命名 |
| Duplicate | 建立副本 | Delete / Delete forever | 刪除 / 永久刪除 |
| Undo / Redo | 復原 / 重做 | Copy / Cut / Paste | 複製 / 剪下 / 貼上 |
| Save / Saved | 儲存 / 已儲存 | Download | 下載 |
| Cancel / Done | 取消 / 完成 | Create | 建立 |
| Search | 搜尋 | Insert | 插入 |
| Edit / Preview | 編輯 / 預覽 | Print | 列印 |
| Header / Footer | 頁首 / 頁尾 | Cover | 封面 |
| Margins | 邊界 | Font | 字型 |
| Paper size | 紙張大小 | Page | 頁 |
| Question | 題目 | Part (of a question) | 分題 |
| Stem | 題幹 | Marks | 分 |
| Answer / Answer key | 答案 / 答案頁 | Answer lines | 答題線 |
| Mark scheme | 評卷參考 | Student / Teacher (view) | 學生版 / 教師版 |
| Diagram / Graph | 圖表 | Curve | 曲線 |
| Point | 點 | Label (on a diagram) | 標示 |
| Tag | 標籤 | Topic | 課題 |
| Class | 班別 | Arrow | 箭頭 |
| Shade | 陰影 | Crop / Zoom / Snap | 裁剪 / 縮放 / 吸附 |
| Title / Name | 標題 / 名稱 | Alt text | 替代文字 |
| Question-Answer Book | 試題答題簿 | Untitled | 未命名 |
| Home | 主頁 | Width | 寬度 |
| Section | 部分 | Part header | 分部標題 |
| Answer space | 答題空間 | Double-click | 按兩下 |
| Tick (a checkbox) | 剔選 | Setup | 頁面設定 |
| Send feedback | 意見回饋 | What's new | 最新功能 |
| Open a file… | 開啟檔案… | Folder (desktop) | 資料夾 |

A term not listed: use the wording a Hong Kong secondary teacher sees in Microsoft Office
(HK) or on HKEAA papers, and add it to `src/i18n/terms.ts`.

## Build

| WP | Model | Scope |
|---|---|---|
| 0 | Opus | `src/i18n/` (setting, hook, catalogue shape, term guard test), Settings section, `<html lang>`, one worked example |
| 1–8 | Sonnet, parallel | one area each: move its strings into a co-located catalogue and translate |

Co-located catalogues (one per area) keep parallel agents out of one shared file.
