/**
 * TOTP 工具库
 *
 * 提供 TOTP（基于时间的一次性密码）相关功能：
 * - 密钥生成
 * - QR Code 生成
 * - 验证码校验
 * - 恢复码生成和验证
 */

import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'crypto';

// 应用名称，用于 TOTP 配置
const ISSUER = 'SQL Ops Console';

// TOTP 配置
const TOTP_CONFIG = {
  digits: 6,
  period: 30, // 30 秒
  algorithm: 'SHA1' as const,
};

// 恢复码配置
const RECOVERY_CODE_LENGTH = 8; // 每个恢复码的长度
const RECOVERY_CODE_COUNT = 8; // 恢复码数量

/**
 * 生成 TOTP 密钥
 * @returns Base32 编码的密钥
 */
export function generateTotpSecret(): string {
  // 生成 20 字节的随机密钥
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
}

/**
 * 创建 TOTP 实例
 * @param secret Base32 编码的密钥
 * @param email 用户邮箱（用于显示）
 */
function createTOTP(secret: string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: TOTP_CONFIG.algorithm,
    digits: TOTP_CONFIG.digits,
    period: TOTP_CONFIG.period,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

/**
 * 生成 TOTP 的 otpauth:// URI
 * @param secret Base32 编码的密钥
 * @param email 用户邮箱
 * @returns otpauth:// URI
 */
export function getTotpUri(secret: string, email: string): string {
  const totp = createTOTP(secret, email);
  return totp.toString();
}

/**
 * 生成 TOTP QR Code 的 Data URL
 * @param secret Base32 编码的密钥
 * @param email 用户邮箱
 * @returns Promise<string> QR Code 的 data URL（可直接用于 img src）
 */
export async function generateQRCodeDataURL(secret: string, email: string): Promise<string> {
  const uri = getTotpUri(secret, email);
  return QRCode.toDataURL(uri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 200,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

/**
 * 验证 TOTP 验证码
 * @param secret Base32 编码的密钥
 * @param code 用户输入的验证码
 * @param email 用户邮箱
 * @returns 验证是否通过
 */
export function verifyTotpCode(secret: string, code: string, email: string): boolean {
  const totp = createTOTP(secret, email);

  // 验证时允许 ±1 个时间窗口的偏移（总共 3 个窗口）
  const delta = totp.validate({
    token: code,
    window: 1,
  });

  return delta !== null;
}

/**
 * 生成当前 TOTP 验证码（用于调试/显示）
 * @param secret Base32 编码的密钥
 * @param email 用户邮箱
 * @returns 当前的 6 位验证码
 */
export function generateCurrentCode(secret: string, email: string): string {
  const totp = createTOTP(secret, email);
  return totp.generate();
}

/**
 * 生成恢复码
 * @param count 恢复码数量，默认 8 个
 * @returns 恢复码数组（明文）
 */
export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];

  for (let i = 0; i < count; i++) {
    // 生成随机字节并转换为大写字母和数字
    const bytes = crypto.randomBytes(RECOVERY_CODE_LENGTH);
    const code = bytes
      .toString('hex')
      .toUpperCase()
      .slice(0, RECOVERY_CODE_LENGTH);

    // 格式化为 XXXX-XXXX 格式便于阅读
    const formatted = `${code.slice(0, 4)}-${code.slice(4, 8)}`;
    codes.push(formatted);
  }

  return codes;
}

/**
 * 哈希恢复码（用于存储）
 * @param code 明文恢复码
 * @returns 哈希后的恢复码
 */
export function hashRecoveryCode(code: string): string {
  // 移除格式字符，统一大写
  const normalized = code.replace(/-/g, '').toUpperCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * 哈希多个恢复码
 * @param codes 明文恢复码数组
 * @returns 哈希后的恢复码数组
 */
export function hashRecoveryCodes(codes: string[]): string[] {
  return codes.map(hashRecoveryCode);
}

/**
 * 验证恢复码
 * @param code 用户输入的恢复码
 * @param hashedCodes 存储的哈希恢复码数组（JSON 字符串）
 * @returns { valid: boolean, index: number } 验证结果和匹配的索引（用于标记已使用）
 */
export function verifyRecoveryCode(
  code: string,
  hashedCodesJson: string
): { valid: boolean; index: number } {
  try {
    const hashedCodes: string[] = JSON.parse(hashedCodesJson);
    const inputHash = hashRecoveryCode(code);

    const index = hashedCodes.findIndex((hash) => hash === inputHash);

    return {
      valid: index !== -1,
      index,
    };
  } catch {
    return { valid: false, index: -1 };
  }
}

/**
 * 标记恢复码为已使用
 * @param hashedCodesJson 存储的哈希恢复码数组（JSON 字符串）
 * @param index 要标记的索引
 * @returns 更新后的 JSON 字符串
 */
export function markRecoveryCodeUsed(hashedCodesJson: string, index: number): string {
  try {
    const hashedCodes: string[] = JSON.parse(hashedCodesJson);

    if (index >= 0 && index < hashedCodes.length) {
      // 将已使用的恢复码标记为空字符串
      hashedCodes[index] = '';
    }

    return JSON.stringify(hashedCodes);
  } catch {
    return hashedCodesJson;
  }
}

/**
 * 获取剩余可用的恢复码数量
 * @param hashedCodesJson 存储的哈希恢复码数组（JSON 字符串）
 * @returns 剩余可用的恢复码数量
 */
export function getRemainingRecoveryCodesCount(hashedCodesJson: string): number {
  try {
    const hashedCodes: string[] = JSON.parse(hashedCodesJson);
    return hashedCodes.filter((code) => code !== '').length;
  } catch {
    return 0;
  }
}

/**
 * 生成安全的随机密码
 * @param length 密码长度，默认 16 位
 * @returns 随机密码
 */
export function generateSecurePassword(length: number = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const bytes = crypto.randomBytes(length);
  let password = '';

  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }

  return password;
}

/**
 * 生成临时验证令牌
 * @returns 安全的随机令牌
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// 用于临时密码加密的密钥（从环境变量获取或使用 BETTER_AUTH_SECRET）
function getEncryptionKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET || 'default-secret-key-for-dev';
  // 使用 SHA-256 哈希确保密钥长度为 32 字节
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * 加密密码（用于临时存储）
 * @param password 明文密码
 * @returns 加密后的密码（包含 IV）
 */
export function encryptPassword(password: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  // 将 IV 和加密数据一起返回
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * 解密密码
 * @param encryptedPassword 加密的密码
 * @returns 明文密码
 */
export function decryptPassword(encryptedPassword: string): string {
  const key = getEncryptionKey();
  const parts = encryptedPassword.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted password format');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
