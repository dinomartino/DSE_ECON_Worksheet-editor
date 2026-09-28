import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StartScreen } from './StartScreen';

describe('the start screen is always home', () => {
  it('offers no way back to the document just left: the panel opens on its header', () => {
    const markup = renderToStaticMarkup(<StartScreen onOpen={() => {}} />);
    expect(markup).not.toMatch(/>Back( to|<)/);
    expect(markup).toMatch(/<aside [^>]*><header /);
  });
});
