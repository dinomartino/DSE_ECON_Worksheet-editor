'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { graphStore } from '@/storage';
import { GraphEditor } from './GraphEditor';
import { GraphLibrary } from './GraphLibrary';

/**
 * Graphs 圖表庫: the start screen's own view beside the Question bank, left by ← Home.
 * Two levels, the library and one graph; the open graph is session state, like the bank's.
 */
export function GraphsScreen({ onHome, settings }: { onHome: () => void; settings?: ReactNode }) {
  const [openId, setOpenId] = useState<string | undefined>();
  return openId ? (
    <GraphEditor key={openId} id={openId} onBack={() => setOpenId(undefined)} settings={settings} />
  ) : (
    <GraphLibrary onHome={onHome} onOpen={setOpenId} settings={settings} />
  );
}

/** How many graphs are saved, for the start screen's row; re-read whenever `stamp` changes. */
export function useGraphCount(stamp: unknown): number | undefined {
  const [count, setCount] = useState<number | undefined>();
  useEffect(() => {
    let live = true;
    void graphStore.list().then(
      (listing) => live && setCount(listing.graphs.length),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [stamp]);
  return count;
}
