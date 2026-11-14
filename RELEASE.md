# Release 1.0.0 — Session overview / 会话总览

A community plugin for **DeepSeek Harness 0.2.2-rc.2**. It adds a standalone session ledger without replacing the conversation UI.

- Browse ordinary sessions across workspaces; filter by archive scope, existing pins and unified live status.
- Search titles, directories and IDs locally; optionally search the existing Host literal-message index with cancellation and bounded plain-text snippets.
- Deterministic sorting and 30-row pagination; expand the full Session ID, working directory and fork parent.
- Open through the original DSH conversation UI. Archived sessions and unsynchronized archive metadata are read-only in this panel.
- No Session mutations, background history opening, agent starts, extra model requests or uploads outside DSH.
- English and Chinese UI; host theme tokens, keyboard focus, coarse-pointer controls and reduced-motion support.
- Original SVG artwork, MIT license, no runtime dependencies and no install scripts.

## Install

Download `dsh-session-view-1.0.0.tgz` from this release and select it through **Plugins → Add plugin**, or enter its absolute local path. Follow DSH's installation result and refresh the existing DSH page if required. Find **Session overview / 会话总览** in the sidebar or the sidebar's More entries.

Do not launch a replacement Web server. Existing chats remain unchanged when the plugin is disabled or removed.

## Verification and limitations

- **98 regression tests passed** for the pure model, filtering/paging, search cancellation, reconnect archive gating and deep workspace-label disambiguation; all fixtures are synthetic.
- Manifest, bundle patch, locales, JavaScript syntax, theme tokens, packed file list and SVG XML are statically checked.
- Local installation reported `application: applied` without warnings; the connected Client registered the sidebar ID and the new main key, retaining the shipped conversation panel.
- An independent UI/UX source review was performed. Live registration is not a screenshot or an end-to-end visual test: no authenticated browser control was available, so light/dark rendering, narrow-screen layout and actual clicks require manual confirmation in the current DSH GUI.
- Only the inspected 0.2.2-rc.2 runtime is declared compatible. No compatibility exemption is granted.

## 中文

这是社区插件，不是官方认证或正式市场收录。新增“会话总览”侧栏入口，支持按工作区、归档范围、置顶及状态集中浏览，并从原聊天界面打开会话。默认标题、目录和 ID 搜索在本页完成；“同时搜索消息”调用 DSH 现有 Host 索引，不调用模型。浏览不启动代理、不加载历史、不改写或归档会话，不向外部上传数据。安装后请按 DSH 提示刷新原页面。

## AI assistance disclosure

The implementation, tests and documentation were created with AI coding assistance in DSH. Verification claims are limited to the evidence stated above; community review and manual UI feedback are welcome.
