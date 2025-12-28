#!/usr/bin/env bun
/**
 * 生成 EXECUTOR_SIGNING_SECRET 密钥
 *
 * 使用方法:
 *   bun scripts/generate-executor-secret.ts
 *
 * 生成后将密钥添加到 Doppler 的 EXECUTOR_SIGNING_SECRET 变量中。
 * Console 和 Executor 必须使用相同的密钥。
 */

import { randomBytes } from "crypto";

// 生成 32 字节（256 位）的随机数据，转换为 64 位十六进制字符串
const secret = randomBytes(32).toString("hex");

console.log("生成的 EXECUTOR_SIGNING_SECRET:\n");
console.log(`  ${secret}`);
console.log("\n请将此密钥添加到 Doppler 的以下配置中:");
console.log("  - Console 项目: EXECUTOR_SIGNING_SECRET");
console.log("  - Executor 项目: EXECUTOR_SIGNING_SECRET");
console.log("\n⚠️  重要: Console 和 Executor 必须使用相同的密钥！\n");

