const { generateChat } = require('../electron/modules/llm');

describe('llm adapter', () => {
  test('throws when missing key', async () => {
    const prev = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    await expect(generateChat([{ role: 'user', content: 'hi'}])).rejects.toThrow('Missing OPENROUTER_API_KEY');
    process.env.OPENROUTER_API_KEY = prev;
  });
});
