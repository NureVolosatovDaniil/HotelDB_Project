const formatter = new Intl.DateTimeFormat('uk-UA', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
});

export function formatDate(value, withTime = false) {
  if (!value) return '\u2014';

  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}:\d{2}(?:\.\d+)?))?/);
  if (!match) return '\u2014';
  const date = new Date(match[1] + 'T00:00:00Z');

  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]) return '\u2014';
  
  const formatted = formatter.format(date).replace(/\d+$/, year => year.padStart(4, '0'));
  return withTime && match[2] ? formatted + ' ' + match[2] : formatted;
}