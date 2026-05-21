# Web 控制台说明

Web 控制台是主入口，当前包含这些页面：

- `Library`：浏览、搜索、安装 source 中的 skills
- `Installed`：查看、搜索、删除、导出、链接已安装 skills
- `Sources`：新增、启用、禁用、删除 source，支持内置源镜像
- `Settings`：配置刷新间隔、托盘行为、主题、翻译和 AI 修改服务
- `Download`：查看桌面端发布信息和下载入口
- `Skill Detail`：查看 skill 详情、翻译内容并进入安装后编辑

当前 Web 相关接口都由本地服务提供，启动方式：

```bash
npm run dev:web
```

默认地址是 `http://127.0.0.1:4587`。

## 关键能力

- 支持 `SKILL.md` frontmatter 作为主元数据来源，`meta.json` 仅作为兼容回退
- 安装命令统一生成 `npx suit-skills@latest install ...`
- 详情页支持翻译模式切换、文件浏览和已安装 skill 的编辑入口
- 已安装 skill 支持恢复单文件、恢复整个 skill、生成 AI 改写预览并应用

## 相关接口

- `GET /api/skills`
- `GET /api/skills/:name`
- `POST /api/install`
- `GET /api/installed`
- `DELETE /api/installed/:name`
- `POST /api/export`
- `GET /api/sources`
- `GET /api/settings`
- `GET /api/translation-config`
- `POST /api/translate`

更完整的命令和页面说明见 [用户手册](./user-manual.md)。
