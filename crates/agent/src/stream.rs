//! Provider stream framing.
//!
//! One SSE framer and one incremental UTF-8 decoder for every host. The codebase
//! previously had two copies of this logic in different states of repair; a
//! streaming bug fixed in one did not reach the other. There is exactly one
//! implementation here, and every host drives it.

/// Incremental UTF-8 decoder for byte streams whose chunk boundaries are not
/// guaranteed to fall on a character boundary.
///
/// Carries incomplete trailing bytes into the next call so no input is lost.
/// Genuinely invalid sequences become `U+FFFD` rather than destroying the
/// surrounding good data.
#[derive(Debug, Default, Clone)]
pub struct Utf8StreamDecoder {
    carry: Vec<u8>,
}

impl Utf8StreamDecoder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Decode one chunk, emitting all bytes that form valid characters.
    pub fn push(&mut self, chunk: &[u8]) -> String {
        if self.carry.is_empty() {
            match std::str::from_utf8(chunk) {
                Ok(text) => return text.to_string(),
                Err(error) => {
                    let valid = error.valid_up_to();
                    let mut out = String::from_utf8_lossy(&chunk[..valid]).into_owned();
                    self.carry = chunk[valid..].to_vec();
                    self.drain_carry(&mut out);
                    return out;
                }
            }
        }

        let mut combined = std::mem::take(&mut self.carry);
        combined.extend_from_slice(chunk);
        let mut out = String::new();
        self.carry = combined;
        self.drain_carry(&mut out);
        out
    }

    /// Emit any trailing bytes that can still form a character, keeping an
    /// incomplete prefix carried. Call at end of stream to flush a replacement
    /// character for a truncated tail.
    pub fn finish(&mut self) -> String {
        let mut out = String::new();
        if !self.carry.is_empty() {
            out.push('\u{FFFD}');
            self.carry.clear();
        }
        out
    }

    fn drain_carry(&mut self, out: &mut String) {
        loop {
            let bytes = std::mem::take(&mut self.carry);
            match std::str::from_utf8(&bytes) {
                Ok(text) => {
                    out.push_str(text);
                    return;
                }
                Err(error) => {
                    let valid = error.valid_up_to();
                    out.push_str(&String::from_utf8_lossy(&bytes[..valid]));
                    match error.error_len() {
                        // Truncated but potentially valid: keep it for next time.
                        None => {
                            self.carry = bytes[valid..].to_vec();
                            return;
                        }
                        // Genuinely invalid: replace and continue scanning.
                        Some(invalid_len) => {
                            out.push('\u{FFFD}');
                            self.carry = bytes[(valid + invalid_len)..].to_vec();
                        }
                    }
                }
            }
        }
    }
}

const EVENT_SEPARATORS: [&[u8]; 2] = [b"\r\n\r\n", b"\n\n"];

/// Pop the next complete SSE event off the front of `buffer`.
///
/// Accepts both `\n\n` and `\r\n\r\n` delimiters. Draining in place keeps this
/// linear: reassigning the remaining tail allocates the whole buffer on every
/// event, which is quadratic over a long stream.
pub fn take_sse_event(buffer: &mut String) -> Option<String> {
    let bytes = buffer.as_bytes();
    let mut found: Option<(usize, usize)> = None;
    for separator in EVENT_SEPARATORS {
        if let Some(position) = memchr::memmem::find(bytes, separator) {
            match found {
                Some((best, _)) if best <= position => {}
                _ => found = Some((position, separator.len())),
            }
        }
    }

    let (position, separator_len) = found?;
    let event = buffer[..position].to_string();
    buffer.drain(..position + separator_len);
    Some(event)
}

/// Extract the payload of one `data:` line from an SSE event block.
///
/// Returns `None` for comment, event-name and blank lines. The OpenAI-compatible
/// streams carry exactly one `data:` line per event.
pub fn sse_data_line(event: &str) -> Option<&str> {
    event.lines().find_map(|line| {
        let data = line.strip_prefix("data:").map(str::trim)?;
        if data.is_empty() || data == "[DONE]" {
            return None;
        }
        Some(data)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn takes_lf_delimited_event_and_drains_in_place() {
        let mut buffer = String::from("data: {\"a\":1}\n\ndata: {\"b\":2}\n\n");
        assert_eq!(
            take_sse_event(&mut buffer),
            Some("data: {\"a\":1}".to_string())
        );
        assert_eq!(
            take_sse_event(&mut buffer),
            Some("data: {\"b\":2}".to_string())
        );
        assert_eq!(take_sse_event(&mut buffer), None);
    }

    #[test]
    fn accepts_crlf_delimiters() {
        let mut buffer = String::from("data: {}\r\n\r\n");
        assert_eq!(take_sse_event(&mut buffer), Some("data: {}".to_string()));
        assert!(buffer.is_empty());
    }

    #[test]
    fn prefers_the_earlier_of_two_delimiter_styles() {
        let mut buffer = String::from("data: one\n\ndata: two\r\n\r\n");
        assert_eq!(take_sse_event(&mut buffer), Some("data: one".to_string()));
        assert_eq!(take_sse_event(&mut buffer), Some("data: two".to_string()));
    }

    #[test]
    fn returns_none_for_an_incomplete_event() {
        let mut buffer = String::from("data: {\"partial\":");
        assert_eq!(take_sse_event(&mut buffer), None);
        assert_eq!(buffer, "data: {\"partial\":");
    }

    #[test]
    fn extracts_data_lines_only() {
        assert_eq!(sse_data_line("data: {\"a\":1}"), Some("{\"a\":1}"));
        assert_eq!(sse_data_line("event: ping\ndata: {}\n"), Some("{}"));
        assert_eq!(sse_data_line("data: [DONE]"), None);
        assert_eq!(sse_data_line("event: ping"), None);
        assert_eq!(sse_data_line("data:   "), None);
    }

    #[test]
    fn decoder_carries_a_split_multi_byte_character() {
        let mut decoder = Utf8StreamDecoder::new();
        // "é" is two bytes; split it across chunks.
        let bytes = "é".as_bytes();
        assert_eq!(decoder.push(&bytes[..1]), "");
        assert_eq!(decoder.push(&bytes[1..]), "é");
        assert_eq!(decoder.finish(), "");
    }

    #[test]
    fn decoder_handles_ascii_fast_path() {
        let mut decoder = Utf8StreamDecoder::new();
        assert_eq!(decoder.push(b"hello"), "hello");
        assert_eq!(decoder.push(b" world"), " world");
    }

    #[test]
    fn decoder_replaces_genuinely_invalid_bytes() {
        let mut decoder = Utf8StreamDecoder::new();
        // 0xFF is never valid in UTF-8.
        let out = decoder.push(b"ok\xffdone");
        assert!(out.starts_with("ok"));
        assert!(out.contains('\u{FFFD}'));
        assert!(out.ends_with("done"), "surrounding good data must survive");
    }

    #[test]
    fn decoder_keeps_a_truncated_tail_and_reports_it_at_finish() {
        let mut decoder = Utf8StreamDecoder::new();
        let bytes = "é".as_bytes();
        assert_eq!(decoder.push(&bytes[..1]), "");
        assert_eq!(decoder.finish(), "\u{FFFD}");
    }

    #[test]
    fn decoder_matches_a_naive_whole_buffered_decode() {
        // Reference oracle: splitting at every possible boundary must produce the
        // same text as decoding the whole buffer once.
        let text = "héllo — wörld ✓ 日本語";
        let bytes = text.as_bytes();
        for split in 0..bytes.len() {
            let mut decoder = Utf8StreamDecoder::new();
            let mut out = decoder.push(&bytes[..split]);
            out.push_str(&decoder.push(&bytes[split..]));
            out.push_str(&decoder.finish());
            assert_eq!(out, text, "split at {split} lost data");
        }
    }
}
