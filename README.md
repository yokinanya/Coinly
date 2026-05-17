# Coinly

Coinly 是一个本地优先的个人多币种记账 PWA。账本数据默认保存在浏览器 IndexedDB 中，并以用户口令加密；同步、导入导出和数据管理都围绕 Coinly 加密包工作。

## 功能范围

- 本地加密账本、记住本设备解锁、加密包导入导出。
- 账户、交易、分类、标签、预算、订阅规则和信用卡账期管理。
- 多币种原币统计，不做隐式汇率换算。
- S3-Compatible、OneDrive、Google Drive 和 WebDAV 同步源管理。
- 同步源二维码导出导入，支持移动端扫码。
- 同步时优先做保守实体级合并；无法证明安全合并时显式提示冲突。
- AI 候选记账，用户确认前不会写入账本。
- PWA 安装和基础离线 shell。

## 本地开发

```bash
npm install
npm run dev
```

开发服务默认由 Vite 启动。OneDrive、Google Drive 和 WebDAV 代理配置见 [docs/OAUTH.md](docs/OAUTH.md) 和 [proxy/webdav/README.md](proxy/webdav/README.md)。

## 发布检查

每次发布前必须通过：

```bash
npm run build
npm run lint
npm run test
```

还需要手工检查桌面端和移动端主要页面、数据管理、信用卡账期、同步冲突处理、二维码导入导出和真实云端同步流程。详细验收标准见 [plan/DESIGN.md](plan/DESIGN.md)。

## 环境变量

复制 `.env.example` 到 `.env.local` 后按需填写：

```env
VITE_ONEDRIVE_CLIENT_ID=
VITE_ONEDRIVE_TENANT_ID=common
VITE_GOOGLE_DRIVE_CLIENT_ID=
VITE_WEBDAV_PROXY_URL=
```

`VITE_*` 会被打包到前端代码中，只能放公开配置，不能放 Client Secret、云厂商 Secret Access Key 或其他私密凭据。

## 数据安全

Coinly 不提供服务端托管账本。用户口令、账本数据、AI API Key 和同步目标凭据都保存在用户本地浏览器环境中。同步目标只保存 Coinly 加密包；同步失败、导入失败和 AI 解析失败都会显式报错。

## 同步一致性

Coinly 同步不是简单用较新的账本覆盖较旧账本。同步时会先读取已配置的远端加密包，并在能证明安全的情况下合并本地和远端实体：两端新增会同时保留，同一实体的单边更新会选择更新时间较新的一份，币种列表会合并去重。合并后的账本会重新加密写回参与同步的远端目标，并应用到本地。

为避免误删和隐藏数据问题，Coinly 不会把“一端缺失某个实体”推断为删除；缺失的一侧会被补回。若同一实体在两端拥有相同 `updatedAt` 但内容不同、远端之间最新版本冲突、远端是旧明文 JSON、或本地与远端更新时间差异过大，应用会停止自动写入并显示冲突处理入口。同步写入期间如果远端版本再次变化，会直接报错并要求重新同步。

## 许可证

MIT
