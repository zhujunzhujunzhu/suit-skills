# 翻译功能说明

Skill 详情页支持对英文内容做翻译，当前有三种模式：

- `replace`：替换原文
- `compare`：双语对照
- `original`：只看原文

## 配置

翻译服务配置在 `Settings` 页面里维护，当前支持：

- `openai`
- `cli`
- `none`

### OpenAI 模式

需要配置：

- API Base URL
- API Key
- Model

### CLI 模式

需要配置：

- CLI 命令
- 附加参数

## 行为

- 翻译结果会在详情页内缓存
- 相同内容会复用近期结果，避免重复请求
- 翻译失败时会保留错误提示，并提供重试

## 相关接口

- `GET /api/translation-config`
- `PATCH /api/translation-config`
- `POST /api/translate`
