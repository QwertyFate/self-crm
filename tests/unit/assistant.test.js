// UNIT tests for utils/assistant.js (ASSISTANT_CHANGES Part 1, 2026-11-24): Claude's side of the admin console's
// assistant — the key and the model, the one request it sends, and the loop that runs the tools Claude calls.
//
// Anthropic is a stand-in: an object with beta.messages.create that writes down every request (a copy of it, as it
// was at that moment) and answers from a script. The errors are the SDK's own classes, made here as the SDK makes
// them. Nothing leaves the machine.
const { test, describe, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');
const Anthropic = require('@anthropic-ai/sdk');
const SDK = Anthropic.default || Anthropic;
const assistant = require('../../utils/assistant');

const saved = { ...process.env };
const setEnv = (more = {}) => { for (const k of ['ANTHROPIC_API_KEY', 'ASSISTANT_MODEL']) delete process.env[k]; Object.assign(process.env, { ANTHROPIC_API_KEY: 'sk-ant-test-key-123', ...more }); };
beforeEach(() => setEnv());
after(() => { for (const k of ['ANTHROPIC_API_KEY', 'ASSISTANT_MODEL']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

// Claude: answers from `script`, one entry per request (an Error is thrown).
function claude(script) {
  const asked = [];
  return { asked, beta: { messages: { create: async req => { asked.push(JSON.parse(JSON.stringify(req))); const next = script.shift(); if (next instanceof Error) throw next; if (!next) throw new Error('the script is at its end'); return next; } } } };
}
const text = t => ({ type: 'text', text: t });
const use = (id, name, input = {}) => ({ type: 'tool_use', id, name, input });
const thinking = { type: 'thinking', thinking: '', signature: 'sig-1' };
const turn = (stop_reason, ...content) => ({ id: 'msg', role: 'assistant', model: 'claude-opus-5-5', stop_reason, content });
const TOOLS = [{ name: 'list_workspaces', description: 'd', input_schema: { type: 'object', properties: {} } }];
const order = (c, more = {}) => assistant.ask(c, { model: 'claude-opus-5-5', system: 'SYSTEM TEXT', tools: TOOLS, messages: [{ role: 'user', content: 'Which workspaces are there?' }], runTool: async () => ({ content: '[]', is_error: false }), ...more });

describe('the key and the model', () => {
  test('named by .env; without a key there is no assistant', () => {
    assert.deepEqual(assistant.config(), { key: 'sk-ant-test-key-123', model: 'claude-opus-5-5' });
    assert.equal(assistant.isConfigured(), true);
    for (const key of ['', '   ']) { setEnv({ ANTHROPIC_API_KEY: key }); assert.equal(assistant.config(), null); assert.equal(assistant.isConfigured(), false); assert.equal(assistant.client(), null); }
    setEnv({ ANTHROPIC_API_KEY: '  sk-ant-x  ' });
    assert.equal(assistant.config().key, 'sk-ant-x', 'blanks around it do not count');
  });
  test('another model can be named — only one of the models this file knows how to ask; any other name is the default', () => {
    assert.equal(assistant.DEFAULT_MODEL, 'claude-opus-5-5');
    assert.deepEqual(assistant.MODELS, { 'claude-opus-5-5': true, 'claude-opus-5': true, 'claude-fable-5-1': true, 'claude-sonnet-5-5': true, 'claude-haiku-5-5': false });
    assert.equal(assistant.MODELS[assistant.DEFAULT_MODEL], true, 'the default is one of them');
    for (const known of Object.keys(assistant.MODELS)) { setEnv({ ASSISTANT_MODEL: known }); assert.equal(assistant.config().model, known, known); }
    setEnv({ ASSISTANT_MODEL: ' claude-fable-5-1 ' });
    assert.equal(assistant.config().model, 'claude-fable-5-1', 'blanks around it do not count');
    // a model of another request shape, another maker's, a name that only looks like one — and the names every object has
    for (const given of ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-5-5-20260401', 'gpt-4', 'claude-', 'claude-opus-5-5; rm', 'Claude-Opus-5-5', 'claude-' + 'x'.repeat(61), '',
      '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      setEnv({ ASSISTANT_MODEL: given });
      assert.equal(assistant.config().model, 'claude-opus-5-5', given);
    }
  });
  test('the SDK\'s client is made once for a key, and again when the key changes', () => {
    const a = assistant.client();
    assert.equal(assistant.client(), a);
    assert.deepEqual([a.apiKey, a.timeout, a.maxRetries, typeof a.beta.messages.create], ['sk-ant-test-key-123', 180000, 1, 'function']);
    assert.deepEqual([assistant.TIMEOUT_MS, assistant.MAX_RETRIES], [180000, 1]);
    setEnv({ ANTHROPIC_API_KEY: 'sk-ant-other' });
    const b = assistant.client();
    assert.notEqual(b, a); assert.equal(b.apiKey, 'sk-ant-other');
  });
});

describe('one request to Claude', () => {
  test('the model, room for the answer, a fallback for a declined request, thinking, the cached system text, the tools and the conversation — and nothing else', async () => {
    const c = claude([turn('end_turn', text('Two: A and B.'))]);
    await order(c);
    assert.deepEqual(c.asked, [{
      model: 'claude-opus-5-5', max_tokens: 16000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      thinking: { type: 'adaptive' }, output_config: { effort: 'medium' },
      system: [{ type: 'text', text: 'SYSTEM TEXT', cache_control: { type: 'ephemeral' } }],
      tools: TOOLS, messages: [{ role: 'user', content: 'Which workspaces are there?' }],
    }]);
    assert.deepEqual([assistant.MAX_TOKENS, assistant.BETAS], [16000, ['server-side-fallback-2026-07-01']]);
  });
  test('the model that is handed in is the one that is asked', async () => {
    const c = claude([turn('end_turn', text('ok'))]);
    await order(c, { model: 'claude-sonnet-5-5' });
    assert.equal(c.asked[0].model, 'claude-sonnet-5-5');
  });
  test('the fallback for a declined request is sent only to a model that has one: every other key of the request stays', async () => {
    for (const [model, takes] of Object.entries(assistant.MODELS)) {
      const c = claude([turn('tool_use', use('t1', 'list_workspaces')), turn('end_turn', text('ok'))]);
      await order(c, { model });
      assert.equal(c.asked.length, 2);
      for (const req of c.asked) {   // the same in every request of the loop
        assert.deepEqual(['betas' in req, 'fallbacks' in req], [takes, takes], model);
        if (takes) assert.deepEqual([req.betas, req.fallbacks], [['server-side-fallback-2026-07-01'], 'default'], model);
        assert.deepEqual(Object.keys(req).sort(), [...(takes ? ['betas', 'fallbacks'] : []), 'max_tokens', 'messages', 'model', 'output_config', 'system', 'thinking', 'tools'].sort(), model);
        assert.deepEqual([req.model, req.max_tokens, req.thinking, req.output_config], [model, 16000, { type: 'adaptive' }, { effort: 'medium' }], model);
      }
    }
    // Claude Haiku 5.5 has no fallback on Anthropic's side: neither key is in its request at all
    const haiku = claude([turn('end_turn', text('ok'))]);
    await order(haiku, { model: 'claude-haiku-5-5' });
    assert.deepEqual(haiku.asked[0], {
      model: 'claude-haiku-5-5', max_tokens: 16000, thinking: { type: 'adaptive' }, output_config: { effort: 'medium' },
      system: [{ type: 'text', text: 'SYSTEM TEXT', cache_control: { type: 'ephemeral' } }],
      tools: TOOLS, messages: [{ role: 'user', content: 'Which workspaces are there?' }],
    });
    // a name that is no model of the list — not even one every object has — gets no fallback either
    for (const model of ['claude-opus-4-8', '__proto__', 'constructor', 'toString']) {
      const c = claude([turn('end_turn', text('ok'))]);
      await order(c, { model });
      assert.deepEqual(['betas' in c.asked[0], 'fallbacks' in c.asked[0]], [false, false], model);
    }
  });
});

describe('the loop', () => {
  test('an answer without a tool call ends it: its text is the reply, and the conversation has grown by it — unchanged', async () => {
    const c = claude([turn('end_turn', thinking, text(' Two workspaces. '), text('A and B.'))]);
    const given = [{ role: 'user', content: 'Which workspaces are there?' }];
    const out = await order(c, { messages: given });
    assert.deepEqual(out, { messages: [given[0], { role: 'assistant', content: [thinking, text(' Two workspaces. '), text('A and B.')] }], reply: 'Two workspaces.\n\nA and B.', stop: 'end_turn' });
    assert.equal(given.length, 1, 'the conversation that was handed in is not changed');
    assert.notEqual(out.messages, given);
  });
  test('a tool call is run and answered, and the conversation is sent again with both', async () => {
    const c = claude([turn('tool_use', thinking, text('Let me look.'), use('tu_1', 'list_workspaces', { a: 1 })), turn('end_turn', text('Two.'))]);
    const ran = [];
    const out = await order(c, { runTool: async (name, input) => { ran.push([name, input]); return { content: '[{"id":7}]', is_error: false }; } });
    assert.deepEqual(ran, [['list_workspaces', { a: 1 }]]);
    assert.equal(c.asked.length, 2);
    assert.deepEqual(c.asked[1].messages, [{ role: 'user', content: 'Which workspaces are there?' }, { role: 'assistant', content: [thinking, text('Let me look.'), use('tu_1', 'list_workspaces', { a: 1 })] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '[{"id":7}]' }] }], 'Claude\'s turn goes back as it came, its thinking block included');
    assert.deepEqual([out.reply, out.stop, out.messages.length], ['Two.', 'end_turn', 4], 'the reply is the last turn\'s text, not what was said on the way');
    assert.deepEqual(c.asked[1].system, c.asked[0].system, 'the same system text every time: it is cached');
    assert.deepEqual(c.asked[1].tools, c.asked[0].tools);
  });
  test('several calls in one turn are all answered in ONE message, in their order; a failed one says so', async () => {
    const c = claude([turn('tool_use', use('tu_1', 'a'), use('tu_2', 'b'), use('tu_3', 'c')), turn('end_turn', text('Done.'))]);
    const out = await order(c, { runTool: async name => (name === 'b' ? { content: 'No such workspace.', is_error: true } : { content: `ran ${name}`, is_error: false }) });
    assert.deepEqual(out.messages[2], { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'ran a' }, { type: 'tool_result', tool_use_id: 'tu_2', content: 'No such workspace.', is_error: true },
      { type: 'tool_result', tool_use_id: 'tu_3', content: 'ran c' }] });
    assert.equal(out.messages.length, 4);
  });
  test('a tool that throws, or answers with nothing usable, is a failed tool — never the end of the order', async () => {
    for (const runTool of [async () => { throw new Error('the database is away'); }, async () => null, async () => ({ content: 5 }), async () => undefined]) {
      const c = claude([turn('tool_use', use('tu_1', 'a')), turn('end_turn', text('I could not look that up.'))]);
      const out = await order(c, { runTool });
      assert.deepEqual(out.messages[2].content, [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'The tool failed on this server.', is_error: true }]);
      assert.equal(out.reply, 'I could not look that up.');
    }
  });
  test('tool calls are answered whatever reason for stopping is named with them: a conversation never ends on calls without answers', async () => {
    const c = claude([turn('end_turn', use('tu_1', 'a')), turn('end_turn', text('ok'))]);
    const out = await order(c);
    assert.deepEqual(out.messages.map(m => m.role), ['user', 'assistant', 'user', 'assistant']);
  });
  test('a paused turn is kept and the conversation sent again as it is', async () => {
    const c = claude([turn('pause_turn', text('Still working')), turn('end_turn', text('Done.'))]);
    const out = await order(c);
    assert.deepEqual(c.asked[1].messages, [{ role: 'user', content: 'Which workspaces are there?' }, { role: 'assistant', content: [text('Still working')] }]);
    assert.deepEqual([out.reply, out.messages.length], ['Done.', 3]);
  });
  test('an answer without any text is an empty reply', async () => {
    for (const content of [[], [thinking], [text('   ')], [{ type: 'text' }, null]]) assert.equal((await order(claude([turn('end_turn', ...content)]))).reply, '');
    const out = await order(claude([{ stop_reason: 'end_turn' }]));
    assert.deepEqual([out.reply, out.messages[1]], ['', { role: 'assistant', content: [] }], 'an answer without content is kept as an empty turn');
    assert.equal((await order(claude([{ content: [text('x')] }]))).stop, 'end_turn', 'no reason named: it ended');
  });
  test('the reply is the words only: a blank text block adds nothing, and a block that is no text is not read even where it carries one', async () => {
    assert.equal((await order(claude([turn('end_turn', text('  '), text('Hello'))]))).reply, 'Hello', 'no empty line in front of the words');
    assert.equal((await order(claude([turn('end_turn', text('Hello'), text('\n'), text('again'))]))).reply, 'Hello\n\nagain');
    const out = await order(claude([turn('end_turn', { type: 'other', text: 'not for the admin' }, text('Hello'), { type: 'thinking', thinking: '', text: 'nor this', signature: 's' })]));
    assert.equal(out.reply, 'Hello');
    assert.deepEqual(out.messages[1].content.map(b => b.type), ['other', 'text', 'thinking'], 'the turn itself is kept as it came');
  });
  test('why Claude stopped is handed back as it was named', async () => {
    assert.equal((await order(claude([turn('stop_sequence', text('x'))]))).stop, 'stop_sequence');
    assert.equal((await order(claude([turn('end_turn', text('x'))]))).stop, 'end_turn');
    assert.equal((await order(claude([turn(undefined, text('x'))]))).stop, 'end_turn', 'none named: it ended');
  });
});

describe('an order that does not come to an end', () => {
  const failed = async (c, more) => { try { await order(c, more); } catch (err) { return err; } return null; };
  test('declined: said before anything of the answer is read, and nothing of it is kept', async () => {
    const c = claude([turn('refusal', text('partial words'))]);
    const err = await failed(c);
    assert.ok(err instanceof assistant.AssistantError);
    assert.deepEqual([err.name, err.code, err.messages], ['AssistantError', 'declined', [{ role: 'user', content: 'Which workspaces are there?' }]]);
    assert.equal(c.asked.length, 1, 'it is not asked again');
  });
  test('an answer that was cut off is not kept either — its tool calls may be half written', async () => {
    for (const stop of ['max_tokens', 'model_context_window_exceeded']) {
      const ran = [];
      const err = await failed(claude([turn(stop, use('tu_1', 'a', { half: true }))]), { runTool: async n => { ran.push(n); return { content: 'x' }; } });
      assert.deepEqual([err.code, err.messages.length, ran.length], ['too_long', 1, 0], stop);
    }
  });
  test('more requests than allowed: too long — and what is kept ends on the tools\' answers', async () => {
    const script = Array.from({ length: 20 }, (_, i) => turn('tool_use', use(`tu_${i}`, 'a')));
    const c = claude(script);
    const err = await failed(c, { maxTurns: 3 });
    assert.deepEqual([err.code, c.asked.length, err.messages.length], ['too_long', 3, 7]);
    assert.deepEqual(err.messages.at(-1), { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_2', content: '[]' }] });
    const twelve = claude(Array.from({ length: 20 }, (_, i) => turn('tool_use', use(`tu_${i}`, 'a'))));
    await failed(twelve);
    assert.deepEqual([twelve.asked.length, assistant.MAX_TURNS], [12, 12], 'twelve requests an order unless another number is handed in');
  });
  test('Anthropic\'s errors, by their class: the key, the limit, no answer, and every other refusal with its words', async () => {
    const body = message => ({ type: 'error', error: { type: 'x', message } });
    const cases = [
      [new SDK.AuthenticationError(401, body('invalid x-api-key'), undefined, new Headers()), 'key', 'Anthropic does not accept the API key'],
      [new SDK.PermissionDeniedError(403, body('no access'), undefined, new Headers()), 'key', 'Anthropic does not accept the API key'],
      [new SDK.RateLimitError(429, body('slow down'), undefined, new Headers()), 'rate', 'Anthropic is limiting requests at the moment'],
      [new SDK.APIConnectionError({ message: 'Connection error.' }), 'unreachable', 'Anthropic could not be reached'],
      [new SDK.APIConnectionTimeoutError(), 'unreachable', 'Anthropic could not be reached'],
      [new SDK.BadRequestError(400, body('messages.2: tool_use ids were found without tool_result blocks'), undefined, new Headers()), 'rejected', 'messages.2: tool_use ids were found without tool_result blocks'],
      [new SDK.InternalServerError(500, body('Overloaded'), undefined, new Headers()), 'rejected', 'Overloaded'],
      [new SDK.APIError(418, undefined, 'teapot', new Headers()), 'rejected', '418 teapot'],
    ];
    for (const [thrown, code, message] of cases) {
      const err = await failed(claude([thrown]));
      assert.ok(err instanceof assistant.AssistantError, code);
      assert.deepEqual([err.code, err.message, err.messages], [code, message, [{ role: 'user', content: 'Which workspaces are there?' }]], thrown.constructor.name);
    }
  });
  test('an error after tools ran keeps the conversation up to their answers', async () => {
    const err = await failed(claude([turn('tool_use', use('tu_1', 'a')), new SDK.APIConnectionError({ message: 'Connection error.' })]));
    assert.deepEqual([err.code, err.messages.map(m => m.role)], ['unreachable', ['user', 'assistant', 'user']]);
    assert.deepEqual(err.messages[2].content[0].type, 'tool_result');
  });
  test('the key is never part of an error, and long words are cut', async () => {
    const leak = new SDK.BadRequestError(400, { type: 'error', error: { message: `bad key sk-ant-api03-SECRET_abc-123 in header ${'x'.repeat(500)}` } }, undefined, new Headers());
    const err = await failed(claude([leak]));
    assert.doesNotMatch(err.message, /SECRET|sk-ant-/);
    assert.match(err.message, /^bad key \[key\] in header x+$/);
    assert.equal(err.message.length, 300);
    assert.doesNotMatch(JSON.stringify(await failed(claude([new SDK.AuthenticationError(401, { error: { message: 'key sk-ant-test-key-123 is wrong' } }, undefined, new Headers())]))), /sk-ant-/);
    const two = await failed(claude([new SDK.BadRequestError(400, { type: 'error', error: { message: 'first sk-ant-api03-AAA_1 then sk-ant-api03-BBB-2 and sk-ant-x' } }, undefined, new Headers())]));
    assert.equal(two.message, 'first [key] then [key] and [key]', 'every key in Anthropic\'s words, not only the first');
  });
  test('what is not Anthropic\'s error is this server\'s: handed on as it is', async () => {
    const bug = new TypeError('something nobody thought of');
    assert.equal(await failed(claude([bug])), bug);
  });
});

describe('how it is built', () => {
  const code = read('utils/assistant.js').replace(/\/\*[\s\S]*?\*\//, '');
  test('it opens no database and writes no log; Anthropic is asked through its SDK, in one place', () => {
    assert.deepEqual([...code.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]), ['@anthropic-ai/sdk']);
    assert.doesNotMatch(code, /console\.|\.query\(|fetch\(/);
    assert.equal((code.match(/messages\.create\(/g) || []).length, 1);
    assert.match(code, /client\.beta\.messages\.create\(\{/);
    assert.deepEqual(Object.keys(assistant).sort(), ['AssistantError', 'BETAS', 'DEFAULT_MODEL', 'MAX_RETRIES', 'MAX_TOKENS', 'MAX_TURNS', 'MODELS', 'TIMEOUT_MS', 'ask', 'client', 'config', 'isConfigured']);
  });
  test('no tool is forced, nothing is sampled, no answer is begun for Claude — and it knows no tool, table or workspace', () => {
    assert.doesNotMatch(code, /tool_choice|temperature|top_p|top_k|budget_tokens|stop_sequences/);
    assert.doesNotMatch(code, /workspace|propose_workflow|list_workspaces|assistant_chats|assistant_proposals/);
    assert.doesNotMatch(code, /role: 'assistant', content: \[?\{ type: 'text'/, 'no prefilled turn');
  });
  test('the errors are told apart by the SDK\'s classes, the most specific first — never by their words', () => {
    const order = ['SDK.AuthenticationError', 'SDK.RateLimitError', 'SDK.APIConnectionError', 'SDK.APIError'].map(name => code.indexOf(`err instanceof ${name}`));
    assert.ok(order.every(i => i > 0) && order.join() === [...order].sort((a, b) => a - b).join(), order.join());
    assert.doesNotMatch(code, /message\.(includes|match)\(|\.test\(err/);
  });
});
