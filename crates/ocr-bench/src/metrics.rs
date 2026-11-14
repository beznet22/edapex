use unicode_normalization::UnicodeNormalization;

pub fn normalize_text(input: &str) -> String {
    let normalized: String = input.nfkc().collect::<String>().to_uppercase();
    let mut out = String::with_capacity(normalized.len());
    let mut space = true;
    for ch in normalized.chars() {
        if ch.is_alphanumeric() {
            out.push(ch);
            space = false;
        } else if !space {
            out.push(' ');
            space = true;
        }
    }
    out.trim().to_string()
}

fn levenshtein<T: PartialEq>(a: &[T], b: &[T]) -> usize {
    if a.is_empty() {
        return b.len();
    }
    if b.is_empty() {
        return a.len();
    }
    let mut previous: Vec<usize> = (0..=b.len()).collect();
    let mut current = vec![0usize; b.len() + 1];
    for (i, ca) in a.iter().enumerate() {
        current[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            current[j + 1] = (previous[j + 1] + 1)
                .min(current[j] + 1)
                .min(previous[j] + cost);
        }
        std::mem::swap(&mut previous, &mut current);
    }
    previous[b.len()]
}

pub fn cer(reference: &str, hypothesis: &str) -> Option<f64> {
    let reference = normalize_text(reference);
    let hypothesis = normalize_text(hypothesis);
    let reference_chars: Vec<char> = reference.chars().collect();
    if reference_chars.is_empty() {
        return None;
    }
    let hypothesis_chars: Vec<char> = hypothesis.chars().collect();
    Some(levenshtein(&reference_chars, &hypothesis_chars) as f64 / reference_chars.len() as f64)
}

pub fn wer(reference: &str, hypothesis: &str) -> Option<f64> {
    let reference = normalize_text(reference);
    let hypothesis = normalize_text(hypothesis);
    let reference_words: Vec<&str> = reference.split_whitespace().collect();
    if reference_words.is_empty() {
        return None;
    }
    let hypothesis_words: Vec<&str> = hypothesis.split_whitespace().collect();
    Some(levenshtein(&reference_words, &hypothesis_words) as f64 / reference_words.len() as f64)
}

pub fn numeric_tokens(input: &str) -> Vec<String> {
    input
        .split(|ch: char| !ch.is_ascii_digit() && ch != '.')
        .filter(|token| !token.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

pub fn numeric_recall(reference: &str, hypothesis: &str) -> Option<f64> {
    let reference = numeric_tokens(&normalize_text(reference));
    if reference.is_empty() {
        return None;
    }
    let reference_len = reference.len();
    let mut hypothesis = numeric_tokens(&normalize_text(hypothesis));
    let mut hits = 0usize;
    for token in &reference {
        if let Some(index) = hypothesis
            .iter()
            .position(|candidate| candidate.as_str() == token.as_str())
        {
            hypothesis.remove(index);
            hits += 1;
        }
    }
    Some(hits as f64 / reference_len as f64)
}

pub fn quantile(values: &[f64], fraction: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(f64::total_cmp);
    let index = ((sorted.len() - 1) as f64 * fraction).ceil() as usize;
    sorted[index.min(sorted.len() - 1)]
}

pub fn mean(values: impl Iterator<Item = f64>) -> Option<f64> {
    let mut sum = 0.0;
    let mut count = 0usize;
    for value in values {
        sum += value;
        count += 1;
    }
    (count > 0).then_some(sum / count as f64)
}

pub fn dir_bytes(paths: &[std::path::PathBuf]) -> u64 {
    paths
        .iter()
        .filter_map(|path| std::fs::metadata(path).ok())
        .map(|meta| meta.len())
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_case_punctuation_and_whitespace() {
        assert_eq!(normalize_text("  Hello,   WORLD! "), "HELLO WORLD");
        assert_eq!(normalize_text("MATH | 25"), "MATH 25");
    }

    #[test]
    fn computes_character_error_rate() {
        assert_eq!(cer("ABCD", "ABCD"), Some(0.0));
        assert_eq!(cer("ABCD", "ABXD"), Some(0.25));
        assert_eq!(cer("", "ABCD"), None);
    }

    #[test]
    fn computes_word_error_rate() {
        assert_eq!(wer("MATH 25", "MATH 25"), Some(0.0));
        assert_eq!(wer("MATH 25", "MATH 26"), Some(0.5));
        assert_eq!(wer("MATH 25", "SCIENCE 25"), Some(0.5));
    }

    #[test]
    fn extracts_numbers_and_recall() {
        assert_eq!(numeric_tokens("MATH 25, ENG 16"), vec!["25", "16"]);
        assert_eq!(numeric_recall("25 16 8", "25 99 8"), Some(2.0 / 3.0));
        assert_eq!(numeric_recall("", "25"), None);
    }

    #[test]
    fn quantile_uses_nearest_rank() {
        assert_eq!(quantile(&[1.0, 2.0, 3.0, 4.0], 0.5), 3.0);
        assert_eq!(quantile(&[1.0, 2.0, 3.0, 4.0], 0.95), 4.0);
        assert_eq!(quantile(&[], 0.5), 0.0);
    }
}
