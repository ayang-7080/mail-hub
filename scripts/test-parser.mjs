// 纯 JS 层面的逻辑测试(不依赖 Electron / native 模块)
import { detectTypeByEmail } from '../src/main/providers/types.js'

const cases = [
  ['a@qq.com', 'qq'],
  ['b@foxmail.com', 'qq'],
  ['c@163.com', '163'],
  ['d@126.com', '163'],
  ['e@yeah.net', '163'],
  ['f@outlook.com', 'ms'],
  ['g@hotmail.com', 'ms'],
  ['h@live.com', 'ms'],
  ['i@example.com', null]
]

let fail = 0
for (const [email, expect] of cases) {
  const got = detectTypeByEmail(email)
  const ok = got === expect
  console.log(`${ok ? 'OK' : 'FAIL'}  detectType(${email}) = ${got} (expect ${expect})`)
  if (!ok) fail++
}

// 模拟 importBatch 的行解析逻辑(从 accountService 里复制核心部分)
function parseLine(raw) {
  const parts = raw.split('----').map((s) => s.trim())
  const typeSet = new Set(['qq', '163', 'ms'])
  let type = null, email, password = '', cookie = ''
  if (parts[0] && typeSet.has(parts[0].toLowerCase()) && parts.length >= 2) {
    type = parts[0].toLowerCase()
    email = parts[1] || ''
    password = parts[2] || ''
    cookie = parts[3] || ''
  } else {
    email = parts[0] || ''
    password = parts[1] || ''
    cookie = parts[2] || ''
  }
  const finalType = type || detectTypeByEmail(email)
  let mode = 'imap'
  if (!password && cookie) mode = 'cookie'
  return { email, type: finalType, password, cookie, mode }
}

const lineCases = [
  { in: 'qq----a@qq.com----pw----', expect: { email: 'a@qq.com', type: 'qq', mode: 'imap' } },
  { in: 'b@163.com----pw163----', expect: { email: 'b@163.com', type: '163', mode: 'imap' } },
  { in: 'ms----c@outlook.com--------tk', expect: { email: 'c@outlook.com', type: 'ms', mode: 'cookie' } },
  { in: 'd@qq.com--------ck', expect: { email: 'd@qq.com', type: 'qq', mode: 'cookie' } }
]
for (const c of lineCases) {
  const r = parseLine(c.in)
  const ok = r.email === c.expect.email && r.type === c.expect.type && r.mode === c.expect.mode
  console.log(`${ok ? 'OK' : 'FAIL'}  parse "${c.in}" => ${JSON.stringify(r)}`)
  if (!ok) fail++
}

if (fail) {
  console.error(`\n${fail} test(s) failed`)
  process.exit(1)
} else {
  console.log('\nAll pure-JS checks passed.')
}
