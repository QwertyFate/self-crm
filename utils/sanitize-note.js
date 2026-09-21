// Server-side sanitiser for note / comment HTML (contenteditable output).
// Small allow-list: inline formatting, links with an http(s)/mailto href,
// line breaks, paragraphs and lists. Everything else — img, script, style,
// span, event-handler attributes, javascript: hrefs — is dropped.
//
// The editor emits <div> for every Enter; the allow-list has no div, and
// discarding it would merge every line of a note into one paragraph. div is
// therefore mapped onto the allowed <p>, which keeps line structure without
// widening the allow-list.
const sanitizeHtml = require('sanitize-html');

const OPTS = {
  allowedTags: ['b', 'i', 'u', 'strong', 'em', 'a', 'br', 'p', 'ul', 'ol', 'li'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  transformTags: { div: 'p' },
};

function sanitizeNote(html) {
  if (html == null) return html;
  return sanitizeHtml(String(html), OPTS);
}

module.exports = { sanitizeNote, NOTE_SANITIZE_OPTS: OPTS };
