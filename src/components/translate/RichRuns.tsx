import { Fragment, type ReactNode } from 'react';
import type { RichText } from '@/model/types';

/**
 * A proposal as it will print, read-only: bold, italic, underline, sub/superscript, a blank
 * (underlined spaces) as a ruled gap, `\n` as a break. Size, colour and font stay on the
 * page. Text is rendered as text, never as markup.
 */
export function RichRuns({ runs, lang, className = '' }: { runs: RichText; lang: 'en' | 'zh-HK'; className?: string }) {
  return (
    <span lang={lang} className={`whitespace-pre-wrap break-words ${className}`}>
      {runs.map((run, i) => {
        const lines = run.text.split('\n');
        let node: ReactNode = lines.map((line, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {line}
          </Fragment>
        ));
        if (run.vertAlign === 'subscript') node = <sub>{node}</sub>;
        else if (run.vertAlign === 'superscript') node = <sup>{node}</sup>;
        const style = [run.bold && 'font-semibold', run.italic && 'italic', run.underline && 'underline underline-offset-2']
          .filter(Boolean)
          .join(' ');
        return style ? (
          <span key={i} className={style}>
            {node}
          </span>
        ) : (
          <Fragment key={i}>{node}</Fragment>
        );
      })}
    </span>
  );
}
