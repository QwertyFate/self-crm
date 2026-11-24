/* ═══════════════════════════════════════════════════════════════════════════
   ASSISTANT — Claude's side of the admin console's assistant
   (ASSISTANT_CHANGES Part 1, 2026-11-24; routes/admin-assistant.js is where it
   is asked, utils/assistant-tools.js what it may look up, utils/assistant-
   prompt.js what it is told, utils/journey-create.js what makes a workflow).

   WHAT IT IS  One conversation with Claude that can call the tools it is
   handed, and nothing else. This file knows no tool, no table and no
   workspace: the tools, what runs them and the conversation so far are handed
   in, and the conversation with what was added comes back. What Claude can do
   is exactly the list of tools the caller hands in.

   SETUP  ANTHROPIC_API_KEY in .env (without it there is no assistant);
   optional ASSISTANT_MODEL (default claude-opus-5-5).

   ONE REQUEST (Anthropic's SDK, the Messages API)
     client.beta.messages.create({
       model, max_tokens: 16000,
       betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
       thinking: { type: 'adaptive' }, output_config: { effort: 'medium' },
       system: [{ type: 'text', text, cache_control: { type: 'ephemeral' } }],
       tools, messages })
     · fallbacks 'default': a request the model's safety checks decline is run
       again on the model Anthropic names for it, inside the same call
     · the system text is the same bytes every time and is cached
     · no tool_choice (forcing a tool is refused by this model), no sampling
       parameters, no prefilled answer

   THE LOOP  ask() sends the conversation and looks at why Claude stopped:
     tool_use     every tool call of the turn is run through runTool(name,
                  input) → { content, is_error }, ALL of them are answered in
                  ONE user message, and the conversation is sent again
     pause_turn   sent again as it is
     end_turn     done: the text of that turn is the reply
     refusal      AssistantError 'declined' — looked at before anything is
                  read from the answer
     max_tokens   AssistantError 'too_long'; so is a conversation that needs
                  more than maxTurns requests
   What Claude answers is appended UNCHANGED, its thinking blocks included:
   the conversation only ever grows at its end. The array handed in is not
   changed; the grown one is handed back.

   ERRORS  AssistantError with code
     key           Anthropic does not accept the key (401 / 403)
     rate          too many requests at the moment (429)
     unreachable   Anthropic did not answer
     declined      the request was declined
     too_long      it did not come to an end
     rejected      every other refusal, with Anthropic's words
   and `messages`: the conversation as far as it is whole — it never ends on
   tool calls without their answers, so it can be kept and gone on with.
   The key is never part of an error.

   Nothing here opens the database module, and nothing here writes a log.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const SDK = Anthropic.default || Anthropic;

const DEFAULT_MODEL = 'claude-opus-5-5', MAX_TOKENS = 16000, MAX_TURNS = 12;
// The models this file knows how to ask (adaptive thinking, effort, no forced tool), and for each whether a declined
// request may be tried again on Anthropic's side (`fallbacks: 'default'`): Claude Haiku 5.5 has no such fallback.
// Any other name in ASSISTANT_MODEL is not used — the default is — so a model with another request shape never gets
// a request it would refuse.
const MODELS = { 'claude-opus-5-5': true, 'claude-opus-5': true, 'claude-fable-5-1': true, 'claude-sonnet-5-5': true, 'claude-haiku-5-5': false };
const TIMEOUT_MS = 180000, MAX_RETRIES = 1;   // one request may think for a while; the SDK tries a failed one once more
const BETAS = ['server-side-fallback-2026-07-01'];
const MAX_WORDS = 300;

class AssistantError extends Error {
  constructor(code, message, messages = []) { super(message); this.name = 'AssistantError'; this.code = code; this.messages = messages; }
}

// The key and the model this server asks with, or null while .env names no key.
function config() {
  const key = String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) return null;
  const model = String(process.env.ASSISTANT_MODEL || '').trim();
  return { key, model: Object.prototype.hasOwnProperty.call(MODELS, model) ? model : DEFAULT_MODEL };
}
const isConfigured = () => !!config();

// The SDK's client for the key of config(): made once, and again when the key changes. null without a key.
let made = null;
function client() {
  const c = config();
  if (!c) return null;
  if (!made || made.key !== c.key) made = { key: c.key, client: new SDK({ apiKey: c.key, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES }) };
  return made.client;
}

// What the SDK threw, as an AssistantError — by its class, the most specific first. Anything that is not the SDK's
// own error is handed back as it is (null): it is this server's, not Anthropic's.
function errorOf(err, messages) {
  if (err instanceof SDK.AuthenticationError || err instanceof SDK.PermissionDeniedError) return new AssistantError('key', 'Anthropic does not accept the API key', messages);
  if (err instanceof SDK.RateLimitError) return new AssistantError('rate', 'Anthropic is limiting requests at the moment', messages);
  if (err instanceof SDK.APIConnectionError) return new AssistantError('unreachable', 'Anthropic could not be reached', messages);
  if (err instanceof SDK.APIError) {
    const said = err.error && err.error.error && typeof err.error.error.message === 'string' ? err.error.error.message : String(err.message || '');
    return new AssistantError('rejected', said.replace(/sk-ant-[\w-]+/g, '[key]').slice(0, MAX_WORDS), messages);
  }
  return null;
}

const textOf = content => (Array.isArray(content) ? content : []).filter(b => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim()).map(b => b.text.trim()).join('\n\n');

// One order, to its end: the conversation `messages` (its last entry is what the admin wrote) is sent, the tools
// Claude calls are run, and it goes on until Claude is done. → { messages, reply, stop }
async function ask(client, { model, system, tools, messages, runTool, maxTurns = MAX_TURNS }) {
  const history = [...messages];
  for (let turn = 0; turn < maxTurns; turn++) {
    let res;
    try {
      res = await client.beta.messages.create({
        model, max_tokens: MAX_TOKENS, ...(MODELS[model] === true ? { betas: BETAS, fallbacks: 'default' } : {}),
        thinking: { type: 'adaptive' }, output_config: { effort: 'medium' },
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools, messages: history,
      });
    } catch (err) {
      const known = errorOf(err, [...history]);
      throw known || err;
    }
    // why it stopped comes first: a declined or cut-off answer is not read and not kept
    if (res.stop_reason === 'refusal') throw new AssistantError('declined', 'The request was declined', [...history]);
    if (res.stop_reason === 'max_tokens' || res.stop_reason === 'model_context_window_exceeded') throw new AssistantError('too_long', 'The answer was cut off', [...history]);
    const content = Array.isArray(res.content) ? res.content : [];
    const calls = content.filter(b => b && b.type === 'tool_use');
    if (!calls.length && res.stop_reason !== 'pause_turn') {
      history.push({ role: 'assistant', content });
      return { messages: history, reply: textOf(content), stop: res.stop_reason || 'end_turn' };
    }
    // every call of the turn is run, and all of them are answered in one message: only then is the turn kept
    const results = [];
    for (const call of calls) {
      let out;
      try { out = await runTool(call.name, call.input); }
      catch { out = null; }
      const whole = !!out && typeof out.content === 'string';   // an answer that is no text is a tool that failed
      results.push({ type: 'tool_result', tool_use_id: call.id, content: whole ? out.content : 'The tool failed on this server.', ...(!whole || out.is_error ? { is_error: true } : {}) });
    }
    history.push({ role: 'assistant', content });
    if (results.length) history.push({ role: 'user', content: results });
  }
  throw new AssistantError('too_long', 'The request needed too many steps', [...history]);
}

module.exports = { AssistantError, DEFAULT_MODEL, MODELS, MAX_TOKENS, MAX_TURNS, TIMEOUT_MS, MAX_RETRIES, BETAS, config, isConfigured, client, ask };
