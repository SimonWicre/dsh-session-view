# 会话总览 / Session overview

适用于 **DeepSeek Harness 0.2.2-rc.2** 的独立会话目录面板。它增加新的侧栏入口，不替换聊天界面。

## 使用

1. 在侧栏点击 **会话总览**；如果入口未固定，在侧栏的更多入口中找到它。
2. 使用搜索框搜索标题、工作目录或会话 ID。选择 **同时搜索消息** 会调用 DSH 已有的消息内容索引；它不是模型请求。
3. 按工作区、归档范围、状态或“仅置顶”筛选。置顶会话排在前面，其余按选定顺序排列。
4. 点击标题或 **打开** 跳转到原聊天界面。右侧展开按钮可查看完整会话 ID、工作目录及分叉来源。
5. 已归档会话在本页只读。需要打开时，请先用内置工作区侧栏取消归档。

### 范围与限制

- 普通会话（含普通分叉）来自 Host 目录；子代理会话和仅被临时保留的子代理回退项不显示。
- 状态来自 DSH 的统一 UI 状态。待响应请求优先显示，其次是运行、结束待查看、空会话或空闲；未查看完成提示沿用 DSH 的浏览器内策略，不是长期审计记录。
- 归档状态尚未同步或工作区信息失败时，暂时禁止打开，避免误操作。
- 搜索按字面词组进行，不解释正则表达式，不进行语义检索。标题、目录及 ID 搜索在本页完成；消息搜索由 DSH Host 执行，有结果上限，命中片段只按普通文本渲染。
- 每页 30 个会话；筛选和排序为当前打开面板的临时视图状态，离开后不写入配置。
- 不为浏览加载历史，不启动或续写代理，不发送消息，不修改会话事件，不归档、取消归档或置顶，不向外部服务上传会话数据。
- 当前仅声明兼容已核实的 **0.2.2-rc.2**，不使用版本豁免。

## 安装

在 **插件 → 添加插件** 中选择本插件目录，或输入发行安装包的绝对路径。安装后按安装结果提示刷新当前 DSH 页面；不需要也不应该启动第二个 Web 服务。

通过本地目录链接安装时，请保留目录，勿在启用期间删除或移动它。通过打包文件安装不依赖源码目录。可以在插件页停用或移除；所有会话记录及原聊天界面保持不变。

## English

Open **Session overview** in the sidebar to browse ordinary sessions without opening history or starting agents. Filter by workspace, archive scope, status and existing pins. Local title/directory/ID search is the default; **Also search messages** calls the existing DSH Host literal-content index and shows its bounded plain-text hits. Open a session through the original conversation UI; archived sessions must first be restored through the built-in sidebar. The panel performs no Session mutation and sends no data outside DSH.

## 开发

本包没有运行时依赖或安装脚本。使用 Node 24 或更新版本：

```powershell
node build.mjs
node --test tests/*.test.js
node tools/check.mjs
```

浏览器产物仅从 DSH 模块表获取 React。页面通过 `main` 和 `sidebar.panellist` Slots 注册，读取宿主选择器 Hooks，使用 `--dsw-alias-*` 主题令牌和英文、中文词典；不访问其他插件 DOM，不复制 React，不替换应用根节点。

测试覆盖纯目录模型、状态优先级、筛选排序分页、内容搜索失败及取消竞态、包清单与资源检查。安装和实时 Slot 注册验证不等同于视觉验证；如无法控制当前已认证浏览器，亮/暗主题、窄屏和真实点击流程应在当前 DSH GUI 手动确认。

## 发布状态

这是可分发插件，不声称获得官方市场收录或官方认证。是否存在官方提交入口及本次提交结果，请以附带的发布说明为准。
