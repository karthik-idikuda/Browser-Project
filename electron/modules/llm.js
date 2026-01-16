const fetch = require('cross-fetch');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function redactor(str) {
  // best-effort PII redaction for logs
  return String(str || '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b\d{13,19}\b/g, '[card]');
}

async function generateChat(messages, model) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY');
  const chosenModel = model || process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free';
  const payload = { model: chosenModel, messages, temperature: 0.2 };
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`AI API error: ${res.status} ${text}`);
  try {
    const json = JSON.parse(text);
    return json;
  } catch {
    return { raw: text };
  }
}

module.exports = { generateChat, redactor };
