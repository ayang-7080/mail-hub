import { safeStorage } from 'electron'

/**
 * 基于 Electron safeStorage 的加密封装。
 * Windows 下使用 DPAPI,数据仅当前用户能解密。
 * 未启用加密(罕见,如某些 Linux 环境)时会降级为明文,需提示用户。
 */

export function encryptString(plain) {
  if (plain == null) return null
  if (!safeStorage.isEncryptionAvailable()) {
    // 降级:直接存 utf8。生产环境应提示用户。
    return Buffer.from(String(plain), 'utf8')
  }
  return safeStorage.encryptString(String(plain))
}

export function decryptString(buf) {
  if (!buf) return null
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  if (!safeStorage.isEncryptionAvailable()) {
    return b.toString('utf8')
  }
  try {
    return safeStorage.decryptString(b)
  } catch (e) {
    return null
  }
}

export function isEncryptionAvailable() {
  return safeStorage.isEncryptionAvailable()
}
