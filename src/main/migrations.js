/**
 * 数据库迁移系统。
 *
 * 每个迁移是一个 { version, description, up(db) } 对象。
 * version 必须递增(1, 2, 3, ...)。
 * up(db) 接收 better-sqlite3 实例,执行 DDL/DML。
 *
 * 新增迁移时只需在数组末尾追加,不要修改已有的迁移。
 * 已经跑过的迁移不会重复执行(靠 user_version 跳过)。
 */

export const migrations = [
  {
    version: 1,
    description: '基础表结构 + 初始列',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          email TEXT NOT NULL,
          type TEXT NOT NULL,
          auth_mode TEXT NOT NULL,
          password_enc BLOB,
          cookie_enc BLOB,
          status TEXT DEFAULT 'unknown',
          last_error TEXT,
          last_sync_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email_mode ON accounts(email, auth_mode);

        CREATE TABLE IF NOT EXISTS mails (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          uid TEXT NOT NULL,
          message_id TEXT,
          subject TEXT,
          from_addr TEXT,
          to_addr TEXT,
          date INTEGER,
          is_read INTEGER DEFAULT 0,
          has_attachment INTEGER DEFAULT 0,
          snippet TEXT,
          fetched_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS mail_contents (
          mail_id INTEGER PRIMARY KEY,
          html TEXT,
          text TEXT,
          headers TEXT,
          FOREIGN KEY (mail_id) REFERENCES mails(id) ON DELETE CASCADE
        );
      `)
    }
  },
  {
    version: 2,
    description: 'OAuth 字段',
    up(db) {
      const cols = db.prepare(`PRAGMA table_info(accounts)`).all().map((c) => c.name)
      if (!cols.includes('oauth_client_id')) db.exec(`ALTER TABLE accounts ADD COLUMN oauth_client_id TEXT`)
      if (!cols.includes('oauth_tenant')) db.exec(`ALTER TABLE accounts ADD COLUMN oauth_tenant TEXT`)
    }
  },
  {
    version: 3,
    description: '登录密码字段',
    up(db) {
      const cols = db.prepare(`PRAGMA table_info(accounts)`).all().map((c) => c.name)
      if (!cols.includes('login_password_enc')) db.exec(`ALTER TABLE accounts ADD COLUMN login_password_enc BLOB`)
    }
  },
  {
    version: 4,
    description: '分组 + 标签',
    up(db) {
      const cols = db.prepare(`PRAGMA table_info(accounts)`).all().map((c) => c.name)
      if (!cols.includes('group_name')) db.exec(`ALTER TABLE accounts ADD COLUMN group_name TEXT`)
      if (!cols.includes('tags')) db.exec(`ALTER TABLE accounts ADD COLUMN tags TEXT`)
    }
  },
  {
    version: 5,
    description: 'folder 字段 + 复合索引',
    up(db) {
      const cols = db.prepare(`PRAGMA table_info(mails)`).all().map((c) => c.name)
      if (!cols.includes('folder')) {
        db.exec(`ALTER TABLE mails ADD COLUMN folder TEXT NOT NULL DEFAULT 'inbox'`)
      }
      db.exec(`DROP INDEX IF EXISTS idx_mails_account_uid`)
      db.exec(`DROP INDEX IF EXISTS idx_mails_account_date`)
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mails_account_folder_uid ON mails(account_id, folder, uid)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_mails_account_folder_date ON mails(account_id, folder, date DESC)`)
    }
  },
  {
    version: 6,
    description: '已注册服务表 + 关联表 + 默认数据',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS services (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          icon TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS account_services (
          account_id INTEGER NOT NULL,
          service_id INTEGER NOT NULL,
          PRIMARY KEY (account_id, service_id),
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
          FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
        );
      `)
      const count = db.prepare('SELECT COUNT(*) AS c FROM services').get().c
      if (count === 0) {
        const defaults = ['QQ', '微信', 'ChatGPT', '谷歌(辅助邮箱)', 'PayPal', 'Twitter/X', 'Facebook', 'GitHub', 'Apple ID', 'Steam']
        const now = Date.now()
        const ins = db.prepare('INSERT OR IGNORE INTO services (name, sort_order, created_at) VALUES (?, ?, ?)')
        for (let i = 0; i < defaults.length; i++) {
          ins.run(defaults[i], i, now)
        }
      }
    }
  },
  {
    version: 7,
    description: '应用设置表(管理员密码等)',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `)
    }
  },
  {
    version: 8,
    description: '账号新增 at_token / rt_token / payurl 字段',
    up(db) {
      const cols = db.prepare(`PRAGMA table_info(accounts)`).all().map((c) => c.name)
      if (!cols.includes('at_token')) db.exec(`ALTER TABLE accounts ADD COLUMN at_token TEXT`)
      if (!cols.includes('rt_token')) db.exec(`ALTER TABLE accounts ADD COLUMN rt_token TEXT`)
      if (!cols.includes('payurl')) db.exec(`ALTER TABLE accounts ADD COLUMN payurl TEXT`)
    }
  }
]

/**
 * 执行迁移。
 * 读取 SQLite 的 user_version,依次执行所有 version > 当前版本的迁移,
 * 每个迁移在独立事务中执行,成功后立即更新 user_version。
 */
export function runMigrations(db) {
  const currentVersion = db.pragma('user_version', { simple: true })

  for (const m of migrations) {
    if (m.version <= currentVersion) continue

    try {
      db.transaction(() => {
        m.up(db)
      })()
      db.pragma(`user_version = ${m.version}`)
      console.log(`[migration] v${m.version}: ${m.description} ✓`)
    } catch (e) {
      console.error(`[migration] v${m.version} FAILED:`, e.message || e)
      throw new Error(`数据库迁移失败(v${m.version}: ${m.description}): ${e.message}`)
    }
  }
}
