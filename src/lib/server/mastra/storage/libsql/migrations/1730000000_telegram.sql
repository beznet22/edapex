ALTER TABLE sm_parents
  ADD COLUMN IF NOT EXISTS telegram_phone VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMP NULL,
  MODIFY COLUMN telegram_chat_id VARCHAR(64) NULL,
  ADD UNIQUE INDEX IF NOT EXISTS sm_parents_telegram_chat_id_unique (telegram_chat_id);

CREATE TABLE IF NOT EXISTS connect_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT NOT NULL,
  token VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  school_id INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY connect_tokens_token_unique (token),
  KEY connect_tokens_parent_id_idx (parent_id),
  CONSTRAINT connect_tokens_parent_id_fk FOREIGN KEY (parent_id) REFERENCES sm_parents (id) ON DELETE CASCADE
);
