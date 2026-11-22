// Fast drop-in for csv-reader 1.0.0 (make.fun): answers exactly as the reference
// does on every input, but with a single-pass, index-based parser instead of the
// reference's one-character-at-a-time string building.
//
// Strategy: unquoted fields are found by scanning for the next delimiter with a
// tight charCodeAt loop and then sliced once (no per-character concatenation);
// quoted fields locate their closing quote with native indexOf and likewise slice
// when the content needs no repair (no doubled quotes, no CR inside). The slow
// paths (stray CRs, quote junk, unterminated quotes, CRs inside quotes) only run
// when the input actually contains those broken bits, and follow the reference's
// policy exactly. No dependencies, no caching across cases, pure per call.
//
// Field end codes: 0 = comma (record goes on), 1 = line break (record ends),
// 2 = end of text (record ends).

const COMMA = 44; // ,
const LF = 10; // \n
const CR = 13; // \r
const QUOTE = 34; // "

/** csv-reader 1.0.0's answer for one case's input {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let i = 0; // next character to read
  let line = 1; // line that character is on
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  while (true) {
    // Lines with no characters are no records.
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === LF) {
        i += 1;
        line += 1;
      } else if (c === CR && text.charCodeAt(i + 1) === LF) {
        i += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (i >= n) break;

    // The record being read: the line it starts on and the index in rows it takes (null: the header).
    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;

    // Read the record's fields, one after another, until one ends the record.
    while (true) {
      let value;
      let ended; // 0 comma, 1 line break, 2 end of text
      let done = false;
      // Pieces for the unquoted scan below: only set when a field continues
      // as unquoted after a quoted part (quote junk, or an unterminated quote
      // re-read as unquoted). null means the field is plain unquoted.
      let parts = null;
      let junkPrefixLen = -1; // >= 0 when quote_junk applies (value length before the junk scan)

      quoted = text.charCodeAt(i) === QUOTE;
      if (quoted) {
        const open = i;
        const openLine = line;
        // Find the closing quote: the next quote that is not doubled.
        let j = open + 1;
        let hasDouble = false;
        let close = -1;
        while (true) {
          const k = text.indexOf('"', j);
          if (k === -1) break;
          if (text.charCodeAt(k + 1) === QUOTE) {
            hasDouble = true;
            j = k + 2;
            continue;
          }
          close = k;
          break;
        }

        if (close === -1) {
          // The quote never closes: it is a literal character, and the text
          // after it is read again as unquoted (unterminated_quote).
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          parts = ['"'];
          i = open + 1;
          line = openLine;
        } else {
          // The quoted content is [open + 1, close): slice it once, then
          // work on the slice, so every scan below is bounded by the
          // content's length instead of running on past the closing quote.
          const content = text.slice(open + 1, close);
          if (!hasDouble && content.indexOf('\r') === -1) {
            // Fast: no doubled quotes and no CR inside; LFs stay as they are.
            value = content;
            let p = 0;
            while (true) {
              p = content.indexOf('\n', p);
              if (p === -1) break;
              line += 1;
              p += 1;
            }
          } else {
            // Slow: rebuild the content, "" to one quote, CR/CRLF to LF.
            const qparts = [];
            const m = content.length;
            let p = 0;
            let seg = 0;
            while (p < m) {
              const c = content.charCodeAt(p);
              if (c === QUOTE) {
                // Every quote before the close is part of a doubled pair.
                qparts.push(content.slice(seg, p), '"');
                p += 2;
                seg = p;
              } else if (c === CR) {
                qparts.push(content.slice(seg, p), '\n');
                line += 1;
                p += content.charCodeAt(p + 1) === LF ? 2 : 1;
                seg = p;
              } else {
                if (c === LF) line += 1;
                p += 1;
              }
            }
            qparts.push(content.slice(seg, m));
            value = qparts.join('');
          }

          i = close + 1;
          if (i >= n) {
            ended = 2;
            done = true;
          } else {
            const c = text.charCodeAt(i);
            if (c === COMMA) {
              i += 1;
              ended = 0;
              done = true;
            } else if (c === LF) {
              i += 1;
              line += 1;
              ended = 1;
              done = true;
            } else if (c === CR && text.charCodeAt(i + 1) === LF) {
              i += 2;
              line += 1;
              ended = 1;
              done = true;
            } else {
              // What follows the closing quote is appended as it stands, up
              // to the next comma or line break (quote_junk, when the field ends).
              parts = [value];
              junkPrefixLen = value.length;
              value = undefined;
            }
          }
        }
      }

      if (!done) {
        // Read unquoted characters up to the next comma or line break: a CR
        // not followed by LF is dropped (stray_cr). `parts` holds the pieces
        // kept so far when the field started as a quoted part or hit a stray CR.
        let s = i;
        while (true) {
          let k = i;
          while (k < n) {
            const c = text.charCodeAt(k);
            if (c === COMMA || c === LF || c === CR) break;
            k += 1;
          }
          if (k >= n) {
            value = parts ? parts.join('') + text.slice(s, n) : text.slice(s, n);
            i = n;
            ended = 2;
            break;
          }
          const c = text.charCodeAt(k);
          if (c === COMMA) {
            value = parts ? parts.join('') + text.slice(s, k) : text.slice(s, k);
            i = k + 1;
            ended = 0;
            break;
          }
          if (c === LF) {
            value = parts ? parts.join('') + text.slice(s, k) : text.slice(s, k);
            i = k + 1;
            line += 1;
            ended = 1;
            break;
          }
          if (text.charCodeAt(k + 1) === LF) {
            value = parts ? parts.join('') + text.slice(s, k) : text.slice(s, k);
            i = k + 2;
            line += 1;
            ended = 1;
            break;
          }
          // A CR not followed by LF is dropped (stray_cr); the field goes on.
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          if (!parts) parts = [];
          parts.push(text.slice(s, k));
          i = k + 1;
          s = k + 1;
        }
        if (junkPrefixLen >= 0 && value.length > junkPrefixLen) {
          errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        }
      }

      fields.push(value);
      if (ended !== 0) break;
    }

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
