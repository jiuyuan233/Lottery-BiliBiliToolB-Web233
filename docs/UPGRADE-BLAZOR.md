# 升级指南：把抽奖页真正嵌进 BiliBiliToolPro 的 Blazor 面板

当前交付版本（方案 A）通过 nginx 把抽奖状态页挂在 `/lottery/` 子路径，
BiliBiliToolPro 面板与抽奖服务共享同一 cookie、同一端口，扫码一次即可两用。

若你希望进一步在 **BiliBiliToolPro 的 Blazor 面板左侧菜单里直接新增一个
「动态抽奖」页面**（而不是跳转到 `/lottery/`），可按以下步骤升级。此步骤需要
完整克隆 BiliBiliToolPro 源码与 .NET SDK 编译环境，因此作为可选升级项。

## 前置环境
- .NET 10 SDK（`mcr.microsoft.com/dotnet/sdk:10.0`）
- Node.js 18+（构建前端）
- 能访问 GitHub 的网络

## 步骤

1. **克隆上游源码**
   ```bash
   git clone https://github.com/RayWangQvQ/BiliBiliToolPro.git
   cd BiliBiliToolPro
   ```

2. **新增 Blazor 页面**（Web 项目通常在 `src/Ray.BiliBiliTool.Web`）
   - 在 `Pages/` 下新建 `Lottery.razor`，内容用 iframe 嵌入抽奖状态页：
     ```razor
     @page "/lottery"
     @layout MainLayout
     <PageTitle>动态抽奖</PageTitle>
     <iframe src="/lottery/" style="width:100%;height:80vh;border:0;"></iframe>
     ```
   - 在 `Shared/MainLayout.razor` 或导航菜单里加一项指向 `/lottery` 的「动态抽奖」。

3. **nginx 调整**：让 `/lottery/` 仍反代到 lottery 容器（本仓库 nginx 配置已就绪），
   Blazor 页面里的 iframe 即可加载抽奖状态页。

4. **重新构建镜像**
   ```bash
   docker build -t my-bili_tool_web .
   ```
   并在 `docker-compose.yml` 里把 `bili_tool_web` 的 `image` 改为 `my-bili_tool_web`。

5. **保留更新渠道**：把上述改动维护在你自己的 fork 里，上游更新时 rebase 即可。

## 说明
- 本升级只改前端展示层，cookie 同步、抽奖执行仍由本仓库的 lottery + cookie-sync 服务完成。
- 若不想改 Blazor，当前方案 A 的 `/lottery/` 已可直接访问，功能完整。
