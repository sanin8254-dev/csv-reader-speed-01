// A fast drop-in replacement for csv-reader 1.0.0: run(input) returns exactly csv-reader's answer for
// {text, header} — {columns, rows, errors} — by the same broken-row policy, but reads the text with
// index-based scanning and string slicing instead of one character at a time.
//
// The policy, matched to csv-reader 1.0.0 behaviour for behaviour:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (error stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled, "" inside it one quote
//     and each CRLF or lone CR inside it read as LF; what follows its closing quote, up to the next comma
//     or line break, is appended as it stands (error quote_junk when the field ends and anything was
//     appended); a quote that never closes is a literal character and the text after it is read again as
//     unquoted (error unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings, never trimmed;
//   - columns is the first record when header is true, else null; rows holds the records after it (every
//     record when header is false), each padded with "" (error short_row, with fields: its field count)
//     or cut (error long_row, with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row} in the order met: line the 1-based line its record starts on
//     (every LF, CRLF and lone CR inside a quoted field counted), row its record's index in rows, null
//     for the header.
//
// Pure: no clock, no randomness, nothing kept from one call to the next.

// How a field ended: at a comma (the record goes on), at a line break, or at the end of the text.
const ENDED_COMMA = 0;
const ENDED_BREAK = 1;
const ENDED_END = 2;

const CH_COMMA = 44; // ,
const CH_LF = 10; // \n
const CH_CR = 13; // \r
const CH_QUOTE = 34; // "
const CH_BOM = 0xfeff;

/** csv-reader's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === CH_BOM) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read, shared through these instead of an object per field.
  let fValue = '';
  let fEnded = ENDED_END;
  let fAdded = 0;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Builds a field value from its first segment plus any later segments (segments appear only when a
  // stray CR split the field). `initial` is '' for a plain field, '"' after an unterminated quote, or
  // the quoted value when junk follows a closing quote.
  function buildValue(initial, parts, segStart, segEnd) {
    if (parts === null) {
      return initial === '' ? text.slice(segStart, segEnd) : initial + text.slice(segStart, segEnd);
    }
    parts.push(text.slice(segStart, segEnd));
    const joined = parts.join('');
    return initial === '' ? joined : initial + joined;
  }

  // Reads unquoted characters onto `initial` up to the next comma or line break: a CR not followed by LF
  // is dropped (stray_cr). Sets fValue, fEnded and fAdded (the characters kept from the text).
  function readUnquoted(initial) {
    let i = pos;
    let segStart = i;
    let parts = null;
    let added = 0;
    while (i < n) {
      const c = text.charCodeAt(i);
      // Every terminator has a code at most 44 (','); most field characters are above it.
      if (c > CH_COMMA) {
        i += 1;
        continue;
      }
      if (c === CH_COMMA) {
        added += i - segStart;
        fValue = buildValue(initial, parts, segStart, i);
        fEnded = ENDED_COMMA;
        fAdded = added;
        pos = i + 1;
        return;
      }
      if (c === CH_LF) {
        added += i - segStart;
        fValue = buildValue(initial, parts, segStart, i);
        fEnded = ENDED_BREAK;
        fAdded = added;
        pos = i + 1;
        line += 1;
        return;
      }
      if (c === CH_CR) {
        if (text.charCodeAt(i + 1) === CH_LF) {
          added += i - segStart;
          fValue = buildValue(initial, parts, segStart, i);
          fEnded = ENDED_BREAK;
          fAdded = added;
          pos = i + 2;
          line += 1;
          return;
        }
        if (parts === null) parts = [];
        parts.push(text.slice(segStart, i));
        added += i - segStart;
        error('stray_cr');
        i += 1;
        segStart = i;
        continue;
      }
      i += 1;
    }
    added += i - segStart;
    fValue = buildValue(initial, parts, segStart, i);
    fEnded = ENDED_END;
    fAdded = added;
    pos = i;
  }

  // Reads a quoted field whose opening quote is at pos. Sets fValue and fEnded.
  function readQuoted() {
    const contentStart = pos + 1;
    // Find the closing quote: the next quote that is not doubled.
    let i = contentStart;
    let close = -1;
    let hasDoubles = false;
    for (;;) {
      const j = text.indexOf('"', i);
      if (j === -1) break;
      if (text.charCodeAt(j + 1) === CH_QUOTE) {
        hasDoubles = true;
        i = j + 2;
        continue;
      }
      close = j;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text after it is read again as
      // unquoted. (line was never advanced by the search, so nothing needs restoring.)
      error('unterminated_quote');
      pos = contentStart;
      readUnquoted('"');
      return;
    }
    // One pass over the content: count the lines it spans and whether it holds a CR. Inside quotes
    // every CR (alone or in CRLF) and every LF not part of a CRLF is one line.
    let crs = 0;
    let lfs = 0;
    let crlfs = 0;
    for (let k = contentStart; k < close; k += 1) {
      const c = text.charCodeAt(k);
      if (c > CH_CR) continue;
      if (c === CH_CR) {
        crs += 1;
        if (text.charCodeAt(k + 1) === CH_LF) crlfs += 1;
      } else if (c === CH_LF) {
        lfs += 1;
      }
    }
    line += crs + lfs - crlfs;
    let value;
    if (crs === 0 && !hasDoubles) {
      value = text.slice(contentStart, close);
    } else {
      // Rebuild: "" becomes one quote, CRLF and a lone CR each become one LF.
      const parts = [];
      let segStart = contentStart;
      let k = contentStart;
      while (k < close) {
        const c = text.charCodeAt(k);
        if (c > CH_QUOTE) {
          k += 1;
          continue;
        }
        if (c === CH_QUOTE) {
          parts.push(text.slice(segStart, k), '"');
          k += 2;
          segStart = k;
          continue;
        }
        if (c === CH_CR) {
          parts.push(text.slice(segStart, k), '\n');
          k += text.charCodeAt(k + 1) === CH_LF ? 2 : 1;
          segStart = k;
          continue;
        }
        k += 1;
      }
      parts.push(text.slice(segStart, close));
      value = parts.join('');
    }
    pos = close + 1;
    if (pos >= n) {
      fValue = value;
      fEnded = ENDED_END;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === CH_COMMA) {
      pos += 1;
      fValue = value;
      fEnded = ENDED_COMMA;
      return;
    }
    if (c === CH_LF) {
      pos += 1;
      line += 1;
      fValue = value;
      fEnded = ENDED_BREAK;
      return;
    }
    if (c === CH_CR && text.charCodeAt(pos + 1) === CH_LF) {
      pos += 2;
      line += 1;
      fValue = value;
      fEnded = ENDED_BREAK;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    readUnquoted(value);
    if (fAdded > 0) error('quote_junk');
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === CH_LF) {
        pos += 1;
        line += 1;
      } else if (c === CH_CR && text.charCodeAt(pos + 1) === CH_LF) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === CH_QUOTE;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fValue);
    } while (fEnded === ENDED_COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
