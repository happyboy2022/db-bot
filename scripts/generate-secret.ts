#!/usr/bin/env bun
/**
 * 生成 BETTER_AUTH_SECRET 密钥
 *
 * 使用方法:
 *   bun scripts/generate-secret.ts
 *
 * 生成后将密钥添加到 Doppler 的 BETTER_AUTH_SECRET 变量中。
 * 所有 worktree 共享同一个密钥，确保会话在不同目录下保持有效。
 */

import { randomBytes } from "crypto";

const secret = randomBytes(32).toString("base64");

console.log("生成的 BETTER_AUTH_SECRET:\n");
console.log(`  ${secret}`);
console.log("\n请将此密钥添加到 Doppler 的 BETTER_AUTH_SECRET 变量中。");
console.log("所有 worktree 共享同一个密钥，确保会话一致性。\n");
