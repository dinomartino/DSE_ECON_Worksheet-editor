import { beforeEach, describe, expect, it } from 'vitest';
import { useBankSession } from '@/components/bank/bankSession';
import { buildDocxParts } from '@/export/docx';
import { createMcqQuestion } from '@/model/factories';
import { bi, plain } from '@/model/text';
import type { LayoutElement, McqQuestion } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import { useWorksheetStore } from '@/store/worksheetStore';
import { emptyPaperFor, insertIntoOpen, topicHeadingLeads, type TopicHeading } from './actions';
import { sourceOf, type PastPaperItem } from './pack';

/** A worksheet from Arrange gets a heading per topic, in the teacher's order (k-0556, user u-n9h1). */

function pastMcq(tag: string): McqQuestion {
  const question = createMcqQuestion();
  question.id = `pp-${tag.replaceAll('/', '_')}`;
  question.blocks = [{ kind: 'paragraph', id: `${question.id}-stem`, text: bi(`Stem ${tag}`, `題幹 ${tag}`) }];
  question.options = ['w', 'x', 'y', 'z'].map((text, index) => ({ id: `${question.id}-${index}`, text: bi(text, text) }));
  question.answerIndex = 1;
  question.tags = [tag];
  question.provenance = bi(tag, tag);
  question.lineage = { rootId: `pp:${tag}` };
  return question;
}

const item = (question: McqQuestion, topicId: string): PastPaperItem => ({
  topicId,
  docId: `pp-bank-${topicId}`,
  question,
  source: sourceOf(question),
  provenance: { en: String(question.tags?.[0]), zh: String(question.tags?.[0]) },
  excerpt: { en: '', zh: '' },
  searchText: '',
});

const A1 = pastMcq('DSE2019/P1/Q1');
const A2 = pastMcq('DSE2020/P1/Q2');
const B1 = pastMcq('CE2006/P2/Q32');
const heading = (key: string, en: string, zh: string): TopicHeading => ({ key, text: bi(en, zh) });
const SCARCITY = heading('scarcity', 'Scarcity', '稀少性');
const COST = heading('opportunity-cost', 'Opportunity Cost', '機會成本');

describe('topicHeadingLeads', () => {
  it('heads each run of a topic, and nothing for one topic', () => {
    const topics = new Map([[`pp:DSE2019/P1/Q1`, SCARCITY], [`pp:DSE2020/P1/Q2`, COST], [`pp:CE2006/P2/Q32`, SCARCITY]]);
    const leads = topicHeadingLeads([A1, A2, B1], topics);
    expect(leads.map((lead) => (lead && lead.kind === 'heading' ? plain(lead.text.en) : undefined))).toEqual(['Scarcity', 'Opportunity Cost', 'Scarcity']);
    expect(topicHeadingLeads([A1, B1], new Map([[`pp:DSE2019/P1/Q1`, SCARCITY], [`pp:CE2006/P2/Q32`, SCARCITY]]))).toEqual([undefined, undefined]);
  });
});

describe('a worksheet from several topics', () => {
  beforeEach(() => {
    useWorksheetStore.getState().replaceWorksheet(emptyPaperFor('classroom', 'Basic Economic Concepts'));
    useBankSession.setState({ review: null });
  });

  const topics = new Map([[`pp:DSE2020/P1/Q2`, COST], [`pp:DSE2019/P1/Q1`, SCARCITY], [`pp:CE2006/P2/Q32`, SCARCITY]]);

  it('prints a heading before each topic, in the order given, in one undo step', () => {
    const before = useWorksheetStore.getState().worksheet;
    // The teacher's order: Opportunity Cost first (one moved question), then Scarcity.
    insertIntoOpen([item(A2, 'scarcity'), item(A1, 'scarcity'), item(B1, 'scarcity')], () => '', { topics });
    const paper = useWorksheetStore.getState().worksheet;
    const layout = new Map(paper.layout.map((element) => [element.id, element]));
    const flow = paper.flow.map((entry) => {
      if (entry.type === 'question') return paper.questions.find((q) => q.id === entry.id)?.tags?.[0];
      const element = layout.get(entry.id) as Extract<LayoutElement, { kind: 'heading' }>;
      return `# ${plain(element.text.en)} / ${plain(element.text.zh)}`;
    });
    expect(flow).toEqual(['# Opportunity Cost / 機會成本', 'DSE2020/P1/Q2', '# Scarcity / 稀少性', 'DSE2019/P1/Q1', 'CE2006/P2/Q32']);
    useWorksheetStore.getState().undo();
    expect(useWorksheetStore.getState().worksheet.flow).toEqual(before.flow);
  });

  it('reaches the page and the .docx in English and 中文', () => {
    insertIntoOpen([item(A2, 'scarcity'), item(A1, 'scarcity')], () => '', { topics });
    const paper = useWorksheetStore.getState().worksheet;
    for (const [language, words] of [['en', ['Opportunity Cost', 'Scarcity']], ['zh', ['機會成本', '稀少性']]] as const) {
      const page = JSON.stringify(renderWorksheet(paper, { language, version: 'student' }));
      const xml = buildDocxParts(paper, { language, version: 'student' }).documentXml;
      for (const word of words) {
        expect(page).toContain(word);
        expect(xml).toContain(word);
      }
      expect(page.indexOf(words[0])).toBeLessThan(page.indexOf(words[1]));
    }
  });

  it('adds no heading for questions of one topic, and none before a question left out', () => {
    insertIntoOpen([item(A1, 'scarcity'), item(B1, 'scarcity')], () => '', { topics });
    expect(useWorksheetStore.getState().worksheet.layout.filter((e) => e.kind === 'heading')).toHaveLength(0);
    // A2 (Opportunity Cost) next to the Scarcity ones already in the paper: only the new one goes in, one topic, no heading.
    insertIntoOpen([item(A2, 'scarcity'), item(A1, 'scarcity')], () => '', { topics });
    expect(useWorksheetStore.getState().worksheet.layout.filter((e) => e.kind === 'heading')).toHaveLength(0);
  });

  it('puts the heading before a shared passage that leads its topic', () => {
    const passage = { kind: 'stimulus' as const, id: 'pp-passage', span: 2, blocks: [{ kind: 'paragraph' as const, id: 'pp-passage-p', text: bi('A passage', '資料') }] };
    const withPassage = (question: McqQuestion, topicId: string) => ({ ...item(question, topicId), stimulus: passage, number: 1 });
    insertIntoOpen([item(A2, 'scarcity'), withPassage(A1, 'scarcity'), withPassage(B1, 'scarcity')], () => '', { topics });
    const paper = useWorksheetStore.getState().worksheet;
    const kinds = paper.flow.map((entry) => (entry.type === 'question' ? 'q' : paper.layout.find((e) => e.id === entry.id)?.kind));
    expect(kinds).toEqual(['heading', 'q', 'heading', 'stimulus', 'q', 'q']);
  });
});
