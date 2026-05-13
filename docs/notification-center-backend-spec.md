# 通知中心 - 后端 API 需求文档

**功能**: [PRD-2026-05-12-003] 无通知中心  
**优先级**: HIGH  
**预期收益**: 提升用户粘性，增加平台使用频次  
**创建时间**: 2026-05-13 11:50:00

---

## 📋 功能概述

实现通知中心，显示以下消息类型：
1. 我的技能被评价 (评价内容摘要)
2. 技能状态变更 (审核中→已发布)
3. 技能有新版本评论
4. 系统通知

通知应该支持：
- 实时推送（未读红点）
- 分类筛选（全部/技能相关/系统）
- 标记为已读/删除
- 点击跳转到相关页面

---

## 🔌 后端 API 需求

### 1. 获取通知列表

**端点**: `GET /api/notifications`

**查询参数**:
```typescript
{
  page?: number;           // 分页，默认 1
  pageSize?: number;       // 每页数量，默认 20
  type?: 'all' | 'skill' | 'system';  // 筛选类型
  unreadOnly?: boolean;    // 仅显示未读，默认 false
}
```

**响应**:
```typescript
{
  data: [
    {
      id: string;
      userId: string;
      type: 'skill_reviewed' | 'skill_status_changed' | 'skill_comment' | 'system';
      title: string;
      message: string;
      relatedSkillId?: string;
      relatedSkillName?: string;
      relatedReviewId?: string;
      isRead: boolean;
      createdAt: string;  // ISO 8601
      actionUrl?: string; // 点击跳转的 URL
    }
  ];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
}
```

### 2. 标记通知为已读

**端点**: `PUT /api/notifications/:id/read`

**请求体**:
```typescript
{
  isRead: boolean;
}
```

**响应**:
```typescript
{
  success: boolean;
  notification: { /* 同上 */ };
}
```

### 3. 批量标记为已读

**端点**: `PUT /api/notifications/batch/read`

**请求体**:
```typescript
{
  notificationIds: string[];
  isRead: boolean;
}
```

**响应**:
```typescript
{
  success: boolean;
  updatedCount: number;
}
```

### 4. 删除通知

**端点**: `DELETE /api/notifications/:id`

**响应**:
```typescript
{
  success: boolean;
}
```

### 5. 获取未读通知数

**端点**: `GET /api/notifications/unread-count`

**响应**:
```typescript
{
  unreadCount: number;
  byType: {
    skill: number;
    system: number;
  };
}
```

### 6. WebSocket 实时推送（可选，第二阶段）

**连接**: `ws://api.example.com/notifications/stream`

**认证**: 通过 JWT token

**推送消息格式**:
```typescript
{
  type: 'notification_new' | 'notification_read' | 'unread_count_changed';
  data: {
    notification?: { /* 同上 */ };
    unreadCount?: number;
  };
}
```

---

## 📊 数据库设计

### Notifications 表

```sql
CREATE TABLE notifications (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type ENUM('skill_reviewed', 'skill_status_changed', 'skill_comment', 'system') NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  related_skill_id VARCHAR(36),
  related_skill_name VARCHAR(255),
  related_review_id VARCHAR(36),
  is_read BOOLEAN DEFAULT FALSE,
  action_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_user_created (user_id, created_at DESC),
  INDEX idx_user_is_read (user_id, is_read),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 🔄 触发规则

### 规则 1: 技能被评价

**触发条件**: 当有新的 FeedbackItem 提交时

**通知内容**:
```
标题: "你的技能 {skillName} 收到新评价"
消息: "{rating}⭐ - {feedbackMessage 前 50 字}..."
类型: skill_reviewed
关联: relatedSkillId, relatedSkillName, relatedReviewId
```

**实现位置**: `submitFeedback()` API 完成后

### 规则 2: 技能状态变更

**触发条件**: 当技能状态从 `待审核` 变为 `已发布` 或 `已驳回` 时

**通知内容**:
```
标题: "你的技能 {skillName} 已发布" 或 "已驳回"
消息: "状态已更新为 {newStatus}"
类型: skill_status_changed
关联: relatedSkillId, relatedSkillName
```

**实现位置**: `updateSkillStatus()` API 完成后

### 规则 3: 技能有新评论

**触发条件**: 当有新的评论/回复时

**通知内容**:
```
标题: "你的技能 {skillName} 有新评论"
消息: "{commentAuthor}: {comment 前 50 字}..."
类型: skill_comment
关联: relatedSkillId, relatedSkillName
```

**实现位置**: `addComment()` API 完成后

### 规则 4: 系统通知

**触发条件**: 管理员手动发送或系统事件

**通知内容**:
```
标题: {adminTitle}
消息: {adminMessage}
类型: system
```

**实现位置**: 管理员后台或系统事件处理

---

## 🔐 权限控制

- 用户只能查看自己的通知
- 用户只能删除/标记自己的通知
- 管理员可以发送系统通知给所有用户或特定用户

---

## 📈 性能考虑

1. **分页**: 默认每页 20 条，支持自定义
2. **索引**: 在 `user_id`, `created_at`, `is_read` 上建立索引
3. **缓存**: 未读通知数可缓存 5 分钟
4. **清理**: 30 天前的已读通知可定期归档

---

## 🚀 实现阶段

### 第一阶段（必需）
- ✅ 数据库表设计
- ✅ 基础 CRUD API
- ✅ 通知触发规则 1-3
- ✅ 前端通知中心 UI

### 第二阶段（可选）
- WebSocket 实时推送
- 通知模板系统
- 邮件/短信通知集成
- 通知偏好设置

---

## 📝 前端集成点

### 前端需要实现的组件

1. **NotificationCenter** 页面
   - 显示通知列表
   - 支持分类筛选
   - 标记为已读/删除

2. **NotificationBell** 组件
   - 显示未读通知数
   - 点击打开通知中心
   - 实时更新未读数

3. **NotificationItem** 组件
   - 显示单条通知
   - 支持点击跳转
   - 支持标记为已读

### 前端 API 调用示例

```typescript
// 获取通知列表
const notifications = await fetch('/api/notifications?page=1&type=all')
  .then(r => r.json());

// 标记为已读
await fetch(`/api/notifications/${id}/read`, {
  method: 'PUT',
  body: JSON.stringify({ isRead: true })
});

// 获取未读数
const { unreadCount } = await fetch('/api/notifications/unread-count')
  .then(r => r.json());
```

---

## ✅ 验收标准

- [ ] 所有 API 端点实现并通过测试
- [ ] 通知触发规则正确执行
- [ ] 前端能正确显示和交互
- [ ] 性能满足要求（列表加载 <500ms）
- [ ] 权限控制正确

---

**预计后端工作量**: 4-6 小时  
**预计前端工作量**: 2-3 小时  
**总计**: 6-9 小时
