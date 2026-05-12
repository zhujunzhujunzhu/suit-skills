# Platform Web 技能包上传、审核与发布需求

## 目标

`platform-web` 的技能上传必须对普通用户足够简单：用户只需要拖拽技能包，平台自动解析出技能信息，用户确认或微调后提交审核。管理员审核通过后，服务端把技能目录写入配置的 Git 仓库并推送。

## 角色与权限

- `user`：登录后可浏览市场、上传技能包、查看自己的技能包。
- `admin`：拥有 `user` 能力，并可查看评价中心、Git 配置、源管理，以及审核/发布上传包。

所有平台页面都需要先登录。未登录用户只能看到登录页。

## 用户流程

1. 用户进入“上传技能”。
2. 将 `.zip` 技能包拖入上传区，或点击选择文件。
3. 后端保存原始包，解压到隔离目录。
4. 后端解析 `SKILL.md` frontmatter、`meta.json` 和目录名，生成技能信息草稿。
5. 前端展示草稿，用户可以修改名称、描述、作者、版本、标签、分类、来源。
6. 用户提交审核，上传记录进入 `waiting_review`。
7. 管理员审核，确认校验结果和技能信息。
8. 管理员点击通过并发布。
9. 服务端写入 Git 仓库的 `skillsDirectory/skillName`，提交 commit，并在可用时 push。
10. 记录状态变为 `published`，技能进入市场。

## 状态

- `parsed`：包已解析，等待用户确认。
- `waiting_review`：用户已提交，等待管理员审核。
- `rejected`：管理员驳回。
- `publishing`：审核通过，正在写入 Git。
- `published`：已发布。
- `publish_failed`：写入或推送失败。

## 校验要求

- 包内必须包含 `SKILL.md`。
- 技能名不能为空，只允许字母、数字、点、下划线和短横线。
- 解压时必须防路径穿越。
- 不执行包内任何代码。
- 记录文件数量和总大小，后续可扩展大小限制、危险文件检测、重名策略。

## API MVP

- `POST /api/uploads/parse`：接收 multipart 文件，保存并解析。
- `PATCH /api/uploads/:id`：用户修改解析出的 metadata。
- `POST /api/uploads/:id/submit`：提交审核。
- `GET /api/uploads`：列出上传记录，支持 `owner` 和 `status`。
- `POST /api/uploads/:id/approve`：管理员审核通过并发布到 Git。

## Git 发布规则

- 使用服务端 `GitConfig.defaultGitUrl` 作为仓库地址，`defaultBranch` 作为目标分支。
- 使用 `skillsDirectory` 作为技能目录根路径。
- 发布时把解析出的技能目录复制到 `{skillsDirectory}/{skillName}`。
- 写入标准化 `meta.json`。
- 执行 `git add`、`git commit`、`git push`。
- 如果仓库地址是本地路径，测试环境允许只 commit，不强制 push 到远端。

