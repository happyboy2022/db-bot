# SQL Ops Console 文档索引

## 文档结构

```
docs/
├── README.md                    # 本文件 - 文档索引
├── dev/                         # 开发指南
│   └── local-development.md    # 本地开发环境搭建
├── overview/                    # 项目概述
│   ├── background.md           # 项目背景与目标
│   ├── architecture.md         # 系统架构
│   └── glossary.md             # 术语定义
├── specs/                       # 功能规格
│   ├── data-model.md           # 数据模型设计
│   ├── auth.md                 # 认证与权限
│   ├── sql-validation.md       # SQL 校验规则
│   ├── request-workflow.md     # 请求工作流
│   ├── execution.md            # 执行流程
│   └── api-contract.md         # Executor API 契约
└── tasks/                       # 开发任务
    ├── README.md               # 任务总览与进度
    ├── phase-1-foundation.md   # 阶段一：基础设施
    ├── phase-2-database.md     # 阶段二：数据库与认证
    ├── phase-3-validation.md   # 阶段三：SQL 校验
    ├── phase-4-console.md      # 阶段四：Console 核心
    ├── phase-5-executor.md     # 阶段五：Executor 服务
    ├── phase-6-execution.md    # 阶段六：执行流程
    ├── phase-7-admin.md        # 阶段七：管理功能
    ├── phase-8-cicd.md         # 阶段八：CI/CD
    └── phase-9-optimization.md # 阶段九：优化与增强 (Post-MVP)
```

## 快速导航

### 开发指南
- [本地开发环境搭建](./dev/local-development.md) ⬅️ **新手入门**

### 项目了解
- [项目背景与目标](./overview/background.md)
- [系统架构](./overview/architecture.md)
- [术语定义](./overview/glossary.md)

### 功能规格
- [数据模型设计](./specs/data-model.md)
- [认证与权限](./specs/auth.md)
- [SQL 校验规则](./specs/sql-validation.md)
- [请求工作流](./specs/request-workflow.md)
- [执行流程](./specs/execution.md)
- [Executor API 契约](./specs/api-contract.md)

### 开发任务
- [任务总览与进度](./tasks/README.md) ⬅️ **开发入口**
- [阶段九：优化与增强](./tasks/phase-9-optimization.md) ⬅️ **当前迭代**

## 如何使用这些文档

### 对于开发者

1. 先阅读 [项目背景](./overview/background.md) 了解项目目标
2. 阅读 [系统架构](./overview/architecture.md) 理解整体设计
3. 查看 [任务总览](./tasks/README.md) 选择可执行的任务
4. 开发完成后更新对应任务文档的状态

### 对于 AI 助手

1. 阅读 [任务总览](./tasks/README.md) 查看任务依赖关系
2. 选择状态为 `[ ]` 且依赖已完成的任务
3. 阅读对应阶段文档了解具体任务内容
4. 参考 `specs/` 下的规格文档了解业务规则
5. 完成后更新任务状态为 `[x]`

## 文档维护规则

- 任务状态只在 `tasks/` 目录下的文档中更新
- `specs/` 目录下的文档为规格说明，一般不需要频繁修改
- 新增功能需求时，先更新 `specs/` 再添加 `tasks/`
