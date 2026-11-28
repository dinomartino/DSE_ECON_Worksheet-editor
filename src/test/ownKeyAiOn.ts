import { vi } from 'vitest';

/**
 * The own-key AI is hidden in the product (`ai/launch.ts`, k-0597), but its tests exercise
 * the code that is kept, so every test file sees the switch on. `ai/launch.test.ts` pins the
 * real value and the hidden behaviour with `vi.doMock`.
 */
vi.mock('@/ai/launch', () => ({ OWN_KEY_AI_ENABLED: true }));
