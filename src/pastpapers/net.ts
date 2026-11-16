/**
 * The Past paper bank's one network call (k-0443): a GET of a public file of the bank, with
 * no credentials, no body and nothing of the teacher's in it. It runs only when the teacher
 * opens the bank (or a topic of it). One of the two files allowed to call the network
 * (`src/test/networkCalls.test.ts`); the other is `src/ai/http.ts`.
 *
 * The desktop app needs no extra permission for it: the webview's own fetch, as the AI
 * requests use (the app's CSP is null; no Tauri plugin involved).
 */

/** Larger than any topic file (the largest is ~4 MB); a bigger answer is refused, not read. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type FetchResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'offline' | 'notFound' | 'http' | 'tooLarge' | 'aborted' };

export type FetchText = (url: string, opts: { fresh: boolean; signal?: AbortSignal }) => Promise<FetchResult>;

/**
 * `fresh` asks the HTTP cache to revalidate (the manifest: a switch-off must be seen at the
 * next opening); topic files may come from the HTTP cache, since their fingerprint is checked.
 */
export const fetchText: FetchText = async (url, { fresh, signal }) => {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: fresh ? 'no-cache' : 'default',
      signal,
    });
  } catch (error) {
    return { ok: false, reason: (error as { name?: string })?.name === 'AbortError' ? 'aborted' : 'offline' };
  }
  if (res.status === 404 || res.status === 410) return { ok: false, reason: 'notFound' };
  if (!res.ok) return { ok: false, reason: 'http' };
  const length = Number(res.headers.get('content-length') ?? '0');
  if (length > MAX_FILE_BYTES) return { ok: false, reason: 'tooLarge' };
  try {
    const text = await res.text();
    return text.length > MAX_FILE_BYTES ? { ok: false, reason: 'tooLarge' } : { ok: true, text };
  } catch (error) {
    return { ok: false, reason: (error as { name?: string })?.name === 'AbortError' ? 'aborted' : 'offline' };
  }
};
