#!/usr/bin/env bun
/**
 * 从 Doppler 同步环境变量到 .env.local 文件
 * 
 * 用于本地开发，当不使用 doppler run -- 时
 * 
 * Usage:
 *   bun scripts/sync-env.ts
 */

import { $ } from "bun";
import { writeFileSync } from "fs";
import { join } from "path";

const projectRoot = join(import.meta.dir, "..");
const consoleEnvPath = join(projectRoot, "apps/console/.env.local");

async function main() {
  console.log("🔄 从 Doppler 同步环境变量到 .env.local...\n");

  // 检查 Doppler 是否配置
  try {
    const config = await $`doppler configure --json`.quiet();
    const parsed = JSON.parse(config.stdout.toString());
    const project = parsed[projectRoot]?.["enclave.project"];
    const configName = parsed[projectRoot]?.["enclave.config"];

    if (!project || !configName) {
      console.error("❌ Doppler 未配置");
      console.log("\n请先运行:");
      console.log("  make setup");
      console.log("  或");
      console.log("  doppler setup\n");
      process.exit(1);
    }

    console.log(`📦 项目: ${project}`);
    console.log(`⚙️  配置: ${configName}\n`);
  } catch (error) {
    console.error("❌ 无法读取 Doppler 配置");
    console.log("\n请先运行:");
    console.log("  make setup");
    console.log("  或");
    console.log("  doppler setup\n");
    process.exit(1);
  }

  // 获取环境变量
  try {
    console.log("📥 从 Doppler 获取环境变量...");
    const secrets = await $`doppler secrets --json`.quiet();
    const output = secrets.stdout.toString();

    // 解析 JSON
    const secretsData = JSON.parse(output) as Record<string, { computed: string; raw?: string }>;
    const envVars: Record<string, string> = {};

    // 提取所有环境变量
    for (const [key, value] of Object.entries(secretsData)) {
      envVars[key] = value.computed || value.raw || "";
    }

    // 检查是否有环境变量
    const envKeys = Object.keys(envVars);
    if (envKeys.length === 0) {
      console.error("❌ Doppler 中没有找到任何环境变量");
      process.exit(1);
    }

    // 对 key 排序，便于阅读
    envKeys.sort();

    // 构建 .env.local 内容
    let envContent = `# 自动生成的环境变量文件
# 从 Doppler 同步: ${new Date().toISOString()}
#
# 注意: 此文件仅用于本地开发
# 生产环境应使用 Doppler 直接注入环境变量
#
# 要更新此文件，运行: bun scripts/sync-env.ts
#

`;

    // 添加所有环境变量
    for (const key of envKeys) {
      const value = envVars[key];
      // 如果值包含特殊字符，用双引号包裹
      if (value.includes(" ") || value.includes("=") || value.includes("#") || value.includes("\n")) {
        envContent += `${key}="${value.replace(/"/g, '\\"')}"\n`;
      } else {
        envContent += `${key}=${value}\n`;
      }
    }

    // 写入文件
    writeFileSync(consoleEnvPath, envContent, "utf-8");
    console.log(`✅ 环境变量已同步到: ${consoleEnvPath}\n`);
    console.log(`📝 已同步 ${envKeys.length} 个环境变量:\n`);

    // 显示所有同步的变量名（值隐藏）
    for (const key of envKeys) {
      console.log(`   ✓ ${key}`);
    }

    console.log("\n💡 提示: 现在可以运行 'bun dev' 或 'make dev-console'");
    console.log("   或者使用 'doppler run -- make dev' 来直接使用 Doppler\n");
  } catch (error: any) {
    console.error("❌ 同步失败:", error.message);
    process.exit(1);
  }
}

main();

