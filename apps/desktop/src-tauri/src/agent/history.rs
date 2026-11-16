//! The transcript as the journal stores it, and back again.
//!
//! One module owns both directions: a resume that decoded this differently from
//! how the recorder wrote it would send the model a different conversation from
//! the one the person was watching.

use edapex_agent::{ChatMessage, Role, ToolCall};
use serde_json::{json, Value};

pub fn encode(messages: &[ChatMessage]) -> Value {
    Value::Array(
        messages
            .iter()
            .map(|message| {
                let calls: Vec<Value> = message
                    .tool_calls
                    .iter()
                    .map(|call| {
                        json!({
                            "id": call.id,
                            "name": call.name,
                            "arguments": call.arguments,
                        })
                    })
                    .collect();
                json!({
                    "role": message.role.as_str(),
                    "content": message.content.as_deref(),
                    "tool_calls": calls,
                    "tool_call_id": message.tool_call_id,
                })
            })
            .collect(),
    )
}

pub fn decode(bytes: &[u8]) -> Result<Vec<ChatMessage>, String> {
    let value: Value =
        serde_json::from_slice(bytes).map_err(|error| format!("Checkpoint is not JSON: {error}"))?;
    let array = value
        .as_array()
        .ok_or_else(|| "A checkpoint is an array of messages".to_string())?;

    let mut messages = Vec::with_capacity(array.len());
    for entry in array {
        let role = match entry.get("role").and_then(Value::as_str) {
            Some("system") => Role::System,
            Some("user") => Role::User,
            Some("assistant") => Role::Assistant,
            Some("tool") => Role::Tool,
            other => return Err(format!("Unknown role {other:?}")),
        };
        let tool_calls = entry
            .get("tool_calls")
            .and_then(Value::as_array)
            .map(|calls| {
                calls
                    .iter()
                    .map(|call| ToolCall {
                        id: call
                            .get("id")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        name: call
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        arguments: call
                            .get("arguments")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                    })
                    .collect()
            })
            .unwrap_or_default();

        messages.push(ChatMessage {
            role,
            content: entry
                .get("content")
                .and_then(Value::as_str)
                .map(std::sync::Arc::from),
            tool_calls,
            tool_call_id: entry
                .get("tool_call_id")
                .and_then(Value::as_str)
                .map(str::to_string),
        });
    }
    Ok(messages)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_transcript_survives_the_round_trip() {
        let original = vec![
            ChatMessage::system("you are EdApex"),
            ChatMessage::user("which marks are missing?"),
            ChatMessage::assistant(
                Some(std::sync::Arc::from("checking")),
                vec![ToolCall {
                    id: "call_1".to_string(),
                    name: "web_search".to_string(),
                    arguments: "{\"query\":\"JSS 2B\"}".to_string(),
                }],
            ),
            ChatMessage {
                role: Role::Tool,
                content: Some(std::sync::Arc::from("3 rows")),
                tool_calls: Vec::new(),
                tool_call_id: Some("call_1".to_string()),
            },
        ];

        let encoded = serde_json::to_vec(&encode(&original)).expect("encode");
        let decoded = decode(&encoded).expect("decode");

        assert_eq!(decoded.len(), original.len());
        for (left, right) in decoded.iter().zip(original.iter()) {
            assert_eq!(left.role.as_str(), right.role.as_str());
            assert_eq!(left.content.as_deref(), right.content.as_deref());
            assert_eq!(left.tool_call_id, right.tool_call_id);
            assert_eq!(left.tool_calls.len(), right.tool_calls.len());
        }
        assert_eq!(decoded[2].tool_calls[0].name, "web_search");
        assert_eq!(decoded[3].tool_call_id.as_deref(), Some("call_1"));
    }

    #[test]
    fn an_unknown_role_is_an_error_not_a_guess() {
        let bad = br#"[{"role":"wizard","content":"hi"}]"#;
        assert!(decode(bad).is_err());
    }
}
