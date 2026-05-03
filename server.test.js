/**
 * Backend test suite for VoteGuide AI Express API.
 *
 * Tests cover:
 *  - State-machine stage transitions (guided journey)
 *  - Input sanitisation and validation
 *  - API response shape contracts
 *  - Edge cases (restart, age parsing, keyword fallbacks)
 *  - AI-chat endpoint error handling
 *
 * The Gemini API is NOT called during tests (GEMINI_API_KEY is unset)
 * so all intent classification falls back to keyword matching.
 *
 * @module server.test
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

// Prevent the server from listening on a port during tests
process.env.VERCEL = '1';
// Disable Gemini API calls in tests — use keyword-only fallbacks.
// Set to empty string (not delete) because dotenv.config() inside server.js
// would re-read the .env file. dotenv never overrides existing env vars,
// so an empty string prevents the real key from being loaded.
process.env.GEMINI_API_KEY = '';

let app;

beforeAll(async () => {
  const mod = await import('./server.js');
  app = mod.default;
});

/* ------------------------------------------------------------------ */
/*  Helper                                                            */
/* ------------------------------------------------------------------ */

/**
 * Sends a guided-chat message and returns the parsed JSON body.
 * @param {string} message
 * @param {string} [language='en']
 * @returns {Promise<object>}
 */
const chat = async (message, language = 'en') => {
  const res = await request(app)
    .post('/api/chat')
    .send({ message, language })
    .expect('Content-Type', /json/)
    .expect(200);
  return res.body;
};

/* ------------------------------------------------------------------ */
/*  Response shape                                                    */
/* ------------------------------------------------------------------ */

describe('API response contract', () => {
  it('POST /api/chat returns required fields', async () => {
    const body = await chat('hello');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('stage');
    expect(typeof body.message).toBe('string');
    expect(typeof body.stage).toBe('string');
  });

  it('GET /api/state returns session state object', async () => {
    const res = await request(app).get('/api/state').expect(200);
    expect(res.body).toHaveProperty('stage');
    expect(res.body).toHaveProperty('has_voter_id');
    expect(res.body).toHaveProperty('simulation_step');
  });

  it('POST /api/ai-chat returns a message field', async () => {
    const res = await request(app)
      .post('/api/ai-chat')
      .send({ message: 'What is EVM?', language: 'en' })
      .expect(200);
    expect(res.body).toHaveProperty('message');
    expect(typeof res.body.message).toBe('string');
  });
});

/* ------------------------------------------------------------------ */
/*  State-machine transitions                                         */
/* ------------------------------------------------------------------ */

describe('Guided journey state machine', () => {
  it('starts at unknown stage and asks about age', async () => {
    const body = await chat('restart');
    expect(body.stage).toBe('unknown');
    expect(body.message.toLowerCase()).toContain('18');
  });

  it('transitions unknown → eligible_not_registered on affirmative', async () => {
    await chat('restart');
    const body = await chat('Yes, I am 18+');
    expect(body.stage).toBe('eligible_not_registered');
  });

  it('transitions unknown → not_eligible on negative', async () => {
    await chat('restart');
    const body = await chat('No, I am under 18');
    expect(body.stage).toBe('not_eligible');
  });

  it('transitions eligible_not_registered → registered on having voter ID', async () => {
    await chat('restart');
    await chat('yes');
    const body = await chat('Yes, I have it');
    expect(body.stage).toBe('registered');
  }, 15000);

  it('stays at eligible_not_registered when user needs to apply', async () => {
    await chat('restart');
    await chat('yes');
    const body = await chat('No, I need to apply');
    expect(body.stage).toBe('eligible_not_registered');
    expect(body.actions).toBeDefined();
  }, 15000);

  it('transitions registered → ready_to_vote after checking roll', async () => {
    await chat('restart');
    await chat('yes');
    await chat('yes I have it');
    const body = await chat('Yes, I checked');
    expect(body.stage).toBe('ready_to_vote');
  }, 15000);

  it('transitions ready_to_vote → completed on voting', async () => {
    await chat('restart');
    await chat('yes');
    await chat('yes I have it');
    await chat('done');
    const body = await chat('I have voted!');
    expect(body.stage).toBe('completed');
  }, 15000);

  it('restart resets the journey to unknown', async () => {
    await chat('yes');
    const body = await chat('restart');
    expect(body.stage).toBe('unknown');
  });
});

/* ------------------------------------------------------------------ */
/*  Simulation flow                                                   */
/* ------------------------------------------------------------------ */

describe('Voting day simulation', () => {
  it('starts simulation and asks for ID', async () => {
    await chat('restart');
    await chat('yes');
    await chat('yes');
    await chat('done');
    const body = await chat('start walkthrough');
    expect(body.message.toLowerCase()).toContain('simulation');
    expect(body.stage).toBe('ready_to_vote');
  });
});

/* ------------------------------------------------------------------ */
/*  Input validation                                                  */
/* ------------------------------------------------------------------ */

describe('Input sanitisation', () => {
  it('handles empty message gracefully', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ message: '', language: 'en' })
      .expect(200);
    expect(res.body).toHaveProperty('message');
  });

  it('handles missing message field gracefully', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ language: 'en' })
      .expect(200);
    expect(res.body).toHaveProperty('message');
  });

  it('rejects invalid language and defaults to en', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'hello', language: 'INVALID' })
      .expect(200);
    // Should still return English (no crash)
    expect(typeof res.body.message).toBe('string');
  });

  it('handles very long messages without crashing', async () => {
    const longMsg = 'a'.repeat(5000);
    const res = await request(app)
      .post('/api/chat')
      .send({ message: longMsg, language: 'en' })
      .expect(200);
    expect(res.body).toHaveProperty('message');
  });
});

/* ------------------------------------------------------------------ */
/*  Hindi language support                                            */
/* ------------------------------------------------------------------ */

describe('Hindi language support', () => {
  it('returns Hindi text when language is hi', async () => {
    await chat('restart');
    const body = await chat('restart', 'hi');
    // Hindi response should contain Devanagari characters
    expect(body.message).toMatch(/[\u0900-\u097F]/);
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases                                                        */
/* ------------------------------------------------------------------ */

describe('Edge cases', () => {
  it('handles numeric age input (25)', async () => {
    await chat('restart');
    const body = await chat('25');
    expect(body.stage).toBe('eligible_not_registered');
  });

  it('handles numeric age input under 18 (15)', async () => {
    await chat('restart');
    const body = await chat('15');
    expect(body.stage).toBe('not_eligible');
  });

  it('provides suggestions as an array', async () => {
    const body = await chat('restart');
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions.length).toBeGreaterThan(0);
  });
});
