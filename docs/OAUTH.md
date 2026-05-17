# OneDrive / Google Drive OAuth 配置

Coinly 的 OneDrive 和 Google Drive 同步运行在浏览器中，属于纯前端 SPA OAuth。项目只需要公开的 OAuth Client ID，不需要、也不能安全保存 Client Secret。不要下载或使用 Google 控制台里的 `client_secret_*.json` 文件。

## 项目环境变量

在本地创建 `.env.local`：

```env
VITE_ONEDRIVE_CLIENT_ID=你的 Microsoft Application Client ID
VITE_ONEDRIVE_TENANT_ID=common
VITE_GOOGLE_DRIVE_CLIENT_ID=你的 Google OAuth Client ID
VITE_WEBDAV_PROXY_URL=你的 WebDAV 代理 Worker 地址
```

`.env.local` 已被 `.gitignore` 忽略，不要提交到 GitHub。修改环境变量后需要重启 Vite 开发服务。

环境变量值不要加引号：

```env
VITE_GOOGLE_DRIVE_CLIENT_ID=134917978401-xxxx.apps.googleusercontent.com
```

生产部署时，在部署平台配置同名环境变量。Vite 会把 `VITE_*` 变量打包到前端 JS 中，所以这里不能放 Client Secret、Access Key Secret 或任何私密凭据。

## 回调地址和来源

OneDrive 使用专用弹窗回调页 `/auth.html` 处理 MSAL 回调，Google Drive 使用当前站点 origin。本地开发通常需要配置：

```text
OneDrive Redirect URI:
http://127.0.0.1:5173/auth.html
http://localhost:5173/auth.html

Google Authorized JavaScript origins:
http://127.0.0.1:5173
http://localhost:5173
```

如果部署到线上，还要加入你的线上域名，例如：

```text
OneDrive Redirect URI:
https://coinly.example.com/auth.html

Google Authorized JavaScript origins:
https://coinly.example.com
```

`localhost` 和 `127.0.0.1` 是不同 origin，需要分别配置。

## Microsoft OneDrive

当前实现使用 Microsoft Graph App Folder，scope 为：

```text
Files.ReadWrite.AppFolder
```

固定文件路径为用户 OneDrive 应用隐藏区中的：

```text
data.coinly.enc.json
```

注意：`Files.ReadWrite.AppFolder` 主要用于个人 Microsoft 账户的 OneDrive App Folder。OneDrive for Business / 工作或学校账户可能不支持这个最小权限路径。

### 创建应用

1. 打开 Microsoft Entra admin center。
2. 进入 `Identity` -> `Applications` -> `App registrations`。
3. 点击 `New registration`。
4. 填写应用名称，例如 `Coinly`。
5. `Supported account types` 建议选择支持个人 Microsoft 账户的选项。
6. 注册后复制 `Application (client) ID`。
7. 将该值写入 `.env.local` 的 `VITE_ONEDRIVE_CLIENT_ID`。

### 配置 SPA Redirect URI

1. 在应用注册详情页进入 `Authentication`。
2. 点击 `Add a platform`。
3. 选择 `Single-page application`。
4. 添加 Redirect URI：

```text
http://127.0.0.1:5173/auth.html
http://localhost:5173/auth.html
https://你的线上域名/auth.html
```

5. 保存。

### 配置权限

1. 进入 `API permissions`。
2. 点击 `Add a permission`。
3. 选择 `Microsoft Graph`。
4. 选择 `Delegated permissions`。
5. 添加：

```text
Files.ReadWrite.AppFolder
```

6. 保存。个人使用通常在首次授权时由用户同意；组织租户可能需要管理员同意。

### Tenant ID

默认使用：

```env
VITE_ONEDRIVE_TENANT_ID=common
```

如果你自部署并只允许某个租户，可以改成对应租户 ID。普通个人 OneDrive 场景保持 `common` 即可。

## Google Drive

当前实现使用 Google Identity Services token flow，scope 为：

```text
https://www.googleapis.com/auth/drive.appdata
https://www.googleapis.com/auth/userinfo.email
```

固定文件路径为用户 Google Drive `appDataFolder` 中的：

```text
data.coinly.enc.json
```

`appDataFolder` 是应用专属隐藏区，用户通常不会在普通 Drive 文件列表中看到该文件。

授权成功后，Coinly 会使用 `userinfo.email` 权限读取当前 Google 账户邮箱，用于在同步提供方列表中显示授权账户。邮箱只作为本地配置展示，不写入远端加密包之外的额外文件。

### 创建 OAuth Client ID

1. 打开 Google Auth Platform / Google Cloud Console。
2. 选择或创建一个项目。
3. 确认已启用 Google Drive API。
4. 进入 `APIs & Services` -> `OAuth consent screen`，完成应用信息配置。
5. 在数据访问 / scopes 中加入：

```text
https://www.googleapis.com/auth/drive.appdata
https://www.googleapis.com/auth/userinfo.email
```

6. 进入 `APIs & Services` -> `Credentials`。
7. 点击 `Create credentials` -> `OAuth client ID`。
8. Application type 选择 `Web application`。
9. 在 `Authorized JavaScript origins` 中添加：

```text
http://127.0.0.1:5173
http://localhost:5173
https://你的线上域名
```

10. 创建后复制 `Client ID`。
11. 将该值写入 `.env.local` 的 `VITE_GOOGLE_DRIVE_CLIENT_ID`。

不要使用 `Desktop app`、`Android`、`iOS` 或下载到本地的 `client_secret_*.json`。Coinly 浏览器端只接受 Web application 的 Client ID。

Google Drive token flow 当前只保存短期 access token 和授权账户邮箱。token 过期后，Coinly 会要求重新授权，不做静默后台刷新。

## WebDAV

WebDAV 同步可直连支持浏览器 CORS 的服务端；如果服务端不允许浏览器跨域请求，可以部署仓库提供的 Cloudflare Workers 代理，或者使用仓库里的 Docker 代理：

```bash
cd proxy/webdav
npx wrangler login
npx wrangler deploy
```

部署后把 Worker 地址写入 `.env.local`：

```env
VITE_WEBDAV_PROXY_URL=https://coinly-webdav-proxy.<account>.workers.dev
```

也可以在同步源表单里为单个 WebDAV 目标填写代理地址。Worker 只做无状态转发，不保存账号、密码或账本数据。WebDAV 默认目录路径为 `Coinly`。

Docker 代理：

```bash
cd proxy/webdav
docker build -t coinly-webdav-proxy .
docker run --rm -p 8787:8787 coinly-webdav-proxy
```

然后把 `http://your-server:8787` 或反代后的地址填到 `VITE_WEBDAV_PROXY_URL`。

## 本地验证

1. 配好 `.env.local`。
2. 重启开发服务：

```bash
npm run dev
```

3. 打开 `http://127.0.0.1:5173/settings`。
4. 在 `同步` 区域添加 OneDrive 或 Google Drive。
5. 点击授权按钮。
6. Google Drive 授权成功后，同步提供方列表的说明行会显示 `Google Drive / 账户邮箱`。
7. 点击测试连接或手动同步。

如果看到 `OAuth Client ID 未配置`，说明环境变量没有被 Vite 读取。检查变量名是否正确，并确认开发服务已经重启。

如果 OneDrive 返回 `interaction_in_progress`，说明 Microsoft 登录、授权或断开连接弹窗仍处于交互中。先完成或关闭已有 Microsoft 弹窗后再重试；如果弹窗已经关闭但状态仍保留，刷新 Coinly 页面后再操作。

如果 OneDrive 授权后停在 `auth.html#code=...`，说明 Microsoft 已返回授权码，但回调页没有成功运行 MSAL bridge。先确认当前运行的是包含 `/auth.html` 的最新构建，并刷新主页面后重试。如果报错里出现 `AADSTS70002` 或 `client_secret`，通常不是代码问题，而是该 Azure 应用注册被配置成了 Web/confidential client，应该改成 `Single-page application` 并使用公开 Client ID。若提示 redirect/origin 不匹配，检查 Microsoft Redirect URI 或 Google Authorized JavaScript origins 是否包含当前浏览器地址对应的配置。Google 授权页如果直接返回 500，优先检查 OAuth Client 类型是否为 Web application、`.env.local` 中是否使用了正确 Client ID、当前 origin 是否已经加入 Authorized JavaScript origins，并重启开发服务。

## 官方参考

- Microsoft SPA app registration: https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-app-registration
- Microsoft redirect URI: https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri
- OneDrive App Folder: https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder
- OneDrive permission scopes: https://learn.microsoft.com/en-gb/onedrive/developer/rest-api/concepts/permissions_reference?view=odsp-graph-online
- Google Identity Services web authorization: https://developers.google.com/identity/oauth2/web/guides/overview
- Google Drive appDataFolder: https://developers.google.com/workspace/drive/api/guides/appdata
