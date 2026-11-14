use ocr_bench::metrics::{cer, numeric_recall, quantile, wer};

#[test]
fn perfect_match_is_zero() {
    assert_eq!(cer("MATH 25 ENG 16", "MATH 25 ENG 16"), Some(0.0));
    assert_eq!(wer("MATH 25 ENG 16", "MATH 25 ENG 16"), Some(0.0));
}

#[test]
fn substitution_is_detected() {
    assert_eq!(cer("ABCD", "ABXD"), Some(0.25));
    assert_eq!(wer("MATH 25", "SCIENCE 25"), Some(0.5));
}

#[test]
fn numeric_recall_is_order_independent() {
    assert_eq!(numeric_recall("25 16 8", "8 25 99"), Some(2.0 / 3.0));
}

#[test]
fn quantile_handles_single_and_empty() {
    assert_eq!(quantile(&[4.2], 0.95), 4.2);
    assert_eq!(quantile(&[], 0.95), 0.0);
}
