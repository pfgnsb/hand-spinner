PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "選択ボード" (
  "識別子" INTEGER PRIMARY KEY,
  "ボード名" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "状態" (
  "識別子" INTEGER PRIMARY KEY,
  "選択ボードの識別子" INTEGER NOT NULL REFERENCES "選択ボード" ("識別子"),
  "状態名" TEXT NOT NULL CHECK ("状態名" IN ('見たい', '途中', '見た')),
  "位置" INTEGER NOT NULL,
  UNIQUE ("選択ボードの識別子", "状態名"),
  UNIQUE ("選択ボードの識別子", "位置")
);

CREATE TABLE IF NOT EXISTS "作品" (
  "識別子" INTEGER PRIMARY KEY,
  "状態の識別子" INTEGER NOT NULL REFERENCES "状態" ("識別子"),
  "名前" TEXT NOT NULL CHECK (length(trim("名前")) > 0),
  "位置" INTEGER NOT NULL,
  UNIQUE ("状態の識別子", "位置")
);

INSERT OR IGNORE INTO "選択ボード" ("識別子", "ボード名") VALUES (1, '映画鑑賞');

INSERT OR IGNORE INTO "状態" ("識別子", "選択ボードの識別子", "状態名", "位置") VALUES
  (1, 1, '見たい', 1),
  (2, 1, '途中', 2),
  (3, 1, '見た', 3);

INSERT OR IGNORE INTO "作品" ("識別子", "状態の識別子", "名前", "位置") VALUES
  (1, 1, '君の名は。', 1),
  (2, 1, 'インターステラー', 2),
  (3, 2, '三体', 1),
  (4, 3, 'ショーシャンクの空に', 1);
