import { describe, expect, it } from 'vitest';
import { messages } from './i18n';

describe('translations', () => {
  it('keeps Vietnamese and English dictionaries aligned', () => {
    expect(Object.keys(messages.vi).sort()).toEqual(Object.keys(messages.en).sort());
  });
});
