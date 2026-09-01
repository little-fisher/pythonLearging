-- 旧表 intelligent_data_history 保留为测试归档，新版不再读写。
CREATE TABLE IF NOT EXISTS intelligent_data_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    identity_key VARCHAR(128) NOT NULL DEFAULT 'shared',
    session_id VARCHAR(128) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message_count INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_message_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_identity_session (identity_key, session_id),
    KEY idx_identity_updated (identity_key, updated_at),
    KEY idx_last_message (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='智能问数会话主表';

CREATE TABLE IF NOT EXISTS intelligent_data_turns (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_pk BIGINT UNSIGNED NOT NULL,
    question_id VARCHAR(128) DEFAULT NULL,
    question TEXT NOT NULL,
    result_json JSON NOT NULL,
    summary TEXT DEFAULT NULL,
    html_url VARCHAR(1000) DEFAULT NULL,
    pdf_url VARCHAR(1000) DEFAULT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'success',
    think_process JSON DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_question_id (question_id),
    KEY idx_session_created (session_pk, created_at),
    CONSTRAINT fk_intelligent_data_turn_session
      FOREIGN KEY (session_pk) REFERENCES intelligent_data_sessions (id)
      ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='智能问数问答轮次表';
