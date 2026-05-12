# Mail Manager

一个本地运行的多邮箱聚合管理工具(Electron + Vue 3 + SQLite)。支持 QQ、163、微软(Outlook/Hotmail/Live)三类邮箱,提供 IMAP 与 Cookie 两种认证方式(Cookie 方案为预留槽位,后续实现具体抓取)。

## 功能

- 账号管理:手动添加、批量导入、测试连通性、编辑、删除
- 邮箱类型:QQ / 163 / 微软(可按邮箱后缀自动识别,也可手动指定)
- 认证方式:
  - IMAP(已实现):使用授权码登录邮箱,拉取收件箱与邮件正文
  - OAuth2(已实现,仅微软):使用 refresh_token + XOAUTH2 通过 IMAP 登录,access_token 自动刷新
  - Cookie/Token(预留):后续针对各家网页接口实现具体抓取
- 收件箱:多账号侧栏切换、手动同步、邮件详情(HTML/纯文本)
- 垃圾邮件:顶部一键切换「收件箱 / 垃圾邮件」,各自独立同步与缓存(按 IMAP SPECIAL-USE 标记自动识别,兼容三家的中英文命名)
- 本地存储:SQLite 保存账号元数据与邮件缓存,密码/refresh_token/Cookie 通过 Electron safeStorage(Windows DPAPI)加密后存储

## 技术栈

- Electron 33
- Vue 3(`<script setup>`,JS)+ Element Plus + Vue Router
- better-sqlite3
- imapflow + mailparser
- electron-vite(开发/构建)

## 开发

```bash
# 首次:安装依赖 + 为 Electron 准备 native 模块
npm install --ignore-scripts
npm rebuild electron
npx electron-builder install-app-deps

# 开发模式(热重载)
npm run dev

# 构建(打包前端 + 主进程 + preload)
npm run build

# 打包 Windows 安装包(NSIS)
npm run dist:win
```

> Windows + 新版 Node(≥22)下,`npm install` 若尝试编译 better-sqlite3 会失败。正确做法是加 `--ignore-scripts` 跳过 npm 构建,再用 `electron-builder install-app-deps` 为 Electron 下载预编译二进制。

## 批量导入格式

每行一条,分隔符固定 `----`。支持:

```
类型----邮箱----密码----cookie
邮箱----密码----cookie
邮箱----密码
ms_oauth----邮箱----refresh_token[----client_id[----tenant]]
```

- 类型取值:`qq` / `163` / `ms` / `ms_oauth`
- 缺省类型时按邮箱后缀识别(`qq.com`、`foxmail.com` → qq;`163.com`、`126.com`、`yeah.net` → 163;`outlook.com`、`hotmail.com`、`live.com` 等 → ms)
- 密码与 cookie 至少提供一个;只提供 cookie 时默认 `auth_mode=cookie`
- `ms_oauth` 的 `client_id` 省略时默认 Thunderbird(`9e5f94bc-e8a4-4e73-b8be-63364c29d753`),`tenant` 默认 `common`

示例:

```
qq----test@qq.com----xxxxxxxxxxxxxxxx
test@163.com----yyyyyyyyyyyyyyyy
ms_oauth----my@outlook.com----M.C123_xxxxxxxxxxxxxxxxxxxxxxxx
ms_oauth----biz@contoso.com----M.R456_xxxxxxxxxxxxxxxxxxxxxxxx----自定义GUID----xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## OAuth 模式说明

微软邮箱推荐使用 OAuth2 + XOAUTH2 接入:

- **什么时候用**:你已经有 `refresh_token`(比如从 Thunderbird、MailCow 等工具,或自己注册 Azure 应用时拿到)
- **工作流程**:应用用 `refresh_token` 向 `login.microsoftonline.com` 请求 `access_token`(1 小时有效),再通过 IMAP 的 XOAUTH2 机制登录;token 快过期时自动刷新
- **client_id**:默认使用 Thunderbird 公开 ID,如果你的 refresh_token 是用其他 client_id 签发的,填对应的值
- **tenant**:个人账号用 `common` 或 `consumers`;企业/组织账号用对应的租户 GUID
- **token 轮换**:微软偶尔会返回新的 refresh_token,应用自动覆盖存库,无需手动维护
- **所需 scope**:`https://outlook.office.com/IMAP.AccessAsUser.All` + `offline_access`(生成 refresh_token 时必须包含这两个)

## 授权码获取

- QQ 邮箱:网页版 → 设置 → 账户 → 开启 IMAP/SMTP 服务 → 获取授权码(16 位,代替登录密码)
- 163 邮箱:网页版 → 设置 → POP3/SMTP/IMAP → 开启 IMAP 并获取「客户端授权密码」
- 微软邮箱:
  - **推荐:OAuth2 refresh_token**(XOAUTH2 方式接入 IMAP),见下文"OAuth 模式"
  - 备选:如果账号开启了两步验证,可在 account.microsoft.com → 安全 → 高级安全选项 → 生成「应用密码」,以此为授权码走 IMAP 普通认证

## 目录结构

```
src/
├── main/                 Electron 主进程
│   ├── index.js          入口(创建窗口 + 注册 IPC)
│   ├── db.js             SQLite 初始化
│   ├── crypto.js         safeStorage 加密封装
│   ├── ipc.js            所有 IPC handler
│   ├── providers/        邮箱类型适配器
│   │   ├── types.js      类型定义 + 后缀识别 + IMAP 配置
│   │   ├── imapProvider.js
│   │   ├── cookieProvider.js   (预留)
│   │   └── index.js
│   └── services/
│       ├── accountService.js
│       └── mailService.js
├── preload/index.js      contextBridge 暴露的 API
└── renderer/             Vue 3 前端
    ├── index.html
    └── src/
        ├── main.js
        ├── App.vue
        ├── router.js
        ├── api.js        前端调用封装
        ├── style.css
        └── views/
            ├── Accounts.vue
            └── Inbox.vue
```

## 数据量能力

- SQLite 单库性能稳定上限约 100 GB
- 10 万封邮件元数据 + 正文约 2–5 GB
- 本项目只在 `mail_contents` 缓存用户打开过的邮件正文,不主动下载全部历史
- 附件场景建议后续扩展为「DB 只存路径 + 文件落盘」

## Cookie 方案扩展位

`src/main/providers/cookieProvider.js` 目前是占位实现。后续要接具体邮箱时:

1. 抓包三家网页版收件箱接口(列表 + 正文)
2. 按 `account.type` 分发到对应实现
3. 接口签名保持与 IMAP provider 一致:`testConnection`、`fetchInbox`、`fetchMailContent`
4. 所有上层代码(services、IPC、前端)无需改动

## 安全说明

- 密码/授权码/Cookie 均用 Electron `safeStorage` 加密后存入 SQLite 的 BLOB 字段
- Windows 下底层使用 DPAPI,只有当前用户在当前机器能解密,拷走 `.sqlite` 文件到别处无法读取
- `contextIsolation: true` + `nodeIntegration: false`,渲染进程通过预声明 API 访问主进程
- 邮件 HTML 正文目前直接 `v-html` 渲染——后续建议接入 DOMPurify 或用 `<iframe sandbox>` 隔离,防御恶意邮件
