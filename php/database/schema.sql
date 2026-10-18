-- =============================================================================
-- Casa de Antón — MySQL 5.7.8+ / MariaDB 10.2+ schema (InnoDB, utf8mb4)
--
-- Same model as src/db/schema.ts in the Next.js version. Import it once from
-- phpMyAdmin (cPanel) or with: mysql -u USER -p DB_NAME < schema.sql
--
-- Conventions:
--   * Ids are UUIDs generated in PHP, stored as VARCHAR(36). NOT CHAR(36):
--     MariaDB rejects generated columns over CHAR columns (error 1901), and
--     the one-active-reservation rule below needs one.
--   * Every DATETIME is UTC. The app sets time_zone = '+00:00' on each
--     connection, so NOW() is UTC as well; pages show Buenos Aires time.
--   * Money is DECIMAL(10,2). PDO returns it as a string: it never goes
--     through a float.
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS events (
  id            VARCHAR(36)   NOT NULL,
  title         VARCHAR(200)  NOT NULL,
  theme         VARCHAR(100)  NULL,
  description   TEXT          NULL,
  -- Public path of the event photo, e.g. /uploads/events/<id>/<file>.webp
  image_url     VARCHAR(500)  NULL,
  location      VARCHAR(200)  NULL,
  starts_at     DATETIME      NOT NULL,
  ends_at       DATETIME      NOT NULL,
  capacity      INT UNSIGNED  NOT NULL,
  price         DECIMAL(10,2) NOT NULL,
  is_published  TINYINT(1)    NOT NULL DEFAULT 0,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY events_published_starts_idx (is_published, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  id                    VARCHAR(36)  NOT NULL,
  full_name             VARCHAR(200) NOT NULL,
  -- Always stored lowercased: it is the identity used to deduplicate people.
  email                 VARCHAR(320) NOT NULL,
  whatsapp              VARCHAR(32)  NOT NULL,
  -- Marketing consent is separate from everything else, by law (Ley 25.326).
  marketing_consent     TINYINT(1)   NOT NULL DEFAULT 0,
  marketing_consent_at  DATETIME     NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY customers_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reservation lifecycle:
--   pending_no_receipt --> pending_review --> approved | rejected
--                      \-> expired
--   any non-terminal   --> cancelled
--
-- The two pending states are NOT the same thing:
--   * pending_no_receipt holds a seat and expires on a timer (30 min). The
--     person has not paid yet, so the system releases the seat on its own.
--   * pending_review holds a seat and NEVER expires: the money already left
--     the person's account, so only the owner can release it.
CREATE TABLE IF NOT EXISTS reservations (
  id                  VARCHAR(36)   NOT NULL,
  event_id            VARCHAR(36)   NOT NULL,
  customer_id         VARCHAR(36)   NOT NULL,
  status              ENUM('pending_no_receipt','pending_review','approved',
                           'rejected','expired','cancelled')
                                    NOT NULL DEFAULT 'pending_no_receipt',
  -- Secret token for the public status page. Never shown in listings.
  public_token        VARCHAR(64)   NOT NULL,
  -- Only meaningful while status is pending_no_receipt.
  expires_at          DATETIME      NULL,

  -- Declared transfer data: an efficiency aid for the owner's manual check,
  -- not a verification mechanism (a receipt can always be forged).
  transfer_holder     VARCHAR(200)  NULL,
  transfer_amount     DECIMAL(10,2) NULL,
  transfer_date       DATE          NULL,
  transfer_reference  VARCHAR(100)  NULL,

  -- Receipt file, relative to storage/receipts (outside public_html).
  receipt_path        VARCHAR(300)  NULL,
  receipt_mime_type   VARCHAR(100)  NULL,
  receipt_uploaded_at DATETIME      NULL,

  -- Health data: sensitive under Ley 25.326. Never in public pages, listings
  -- or exports; never used for marketing or shared with third parties.
  has_condition       TINYINT(1)    NOT NULL,
  condition_details   TEXT          NULL,

  -- NULL: the booking form has no terms checkbox (decision D2), so no
  -- acceptance is recorded that the person never gave.
  terms_accepted_at   DATETIME      NULL,
  rejection_reason    TEXT          NULL,
  resolved_at         DATETIME      NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- "One active reservation per person and event". MySQL has no partial
  -- indexes, so this generated column holds the customer only while the
  -- STORED status holds a seat, and NULL otherwise. A unique index allows any
  -- number of NULLs: rejected, expired and cancelled rows never block a new
  -- attempt. A pending_no_receipt whose timer ran out is materialized to
  -- 'expired' inside the booking transaction before the insert, so it stops
  -- blocking too (same as T10 in the Next.js version).
  active_customer_id  VARCHAR(36) AS (
                        CASE WHEN status IN ('pending_no_receipt','pending_review','approved')
                             THEN customer_id END
                      ) STORED,

  PRIMARY KEY (id),
  UNIQUE KEY reservations_public_token_unique (public_token),
  UNIQUE KEY reservations_active_per_person_unique (event_id, active_customer_id),
  KEY reservations_event_status_idx (event_id, status),
  KEY reservations_customer_idx (customer_id),
  CONSTRAINT reservations_event_fk FOREIGN KEY (event_id)
    REFERENCES events (id) ON DELETE RESTRICT,
  CONSTRAINT reservations_customer_fk FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
