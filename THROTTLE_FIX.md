# Microsoft IMAP 限流优化方案

## 问题分析

微软对同一邮箱短时间内多次 IMAP XOAUTH2 认证进行限流，返回 "User is authenticated but not connected" 错误。

### 原有策略的不足

1. **连接池 TTL 太短 (90s)**: 用户如果等待 2 分钟再请求，连接过期导致重新认证
2. **无主动保活**: 空闲连接可能被服务器单方面断开，下次使用时强制重新认证
3. **限流冷却期偏短 (90s)**: 微软的限流窗口可能更长
4. **限流后清空 token 缓存**: 反而加剧问题，强制重新刷新 token

## 优化措施

### 1. 延长连接池生命周期
```typescript
const IMAP_POOL_TTL_MS = 15 * 60 * 1000;  // 90s → 15min
```

**原理**: 减少新连接认证次数是关键。15 分钟内的多次请求全部复用同一连接，不触发新认证。

### 2. 实现 NOOP 保活机制
```typescript
const IMAP_KEEPALIVE_INTERVAL_MS = 30 * 1000;

function touchMicrosoftImap(email: string) {
  // 每次使用连接后，30s 空闲时自动发送 NOOP 保持连接活跃
  entry.keepaliveTimer = setTimeout(async () => {
    await entry.client.noop();
  }, IMAP_KEEPALIVE_INTERVAL_MS);
}
```

**原理**: 
- IMAP `NOOP` 命令不触发新认证，只维持现有连接
- 防止服务器因空闲超时单方面断开连接
- 连接断开后才需要重新认证，保活可延长单次认证的有效期

### 3. 延长限流冷却期
```typescript
const IMAP_THROTTLE_COOLDOWN_MS = 180 * 1000;  // 90s → 180s
```

**原理**: 给微软的限流窗口充分恢复时间，避免过早重试再次触发限流。

### 4. 移除限流后清空 token 缓存的逻辑
```typescript
// 删除了这段代码：
// if (isImapThrottled(user.email)) {
//   tokenCache.delete(tokenCacheKey);
// }
```

**原理**: 限流是连接认证行为的限制，不是 token 本身的问题。清空缓存反而导致下次请求需要重新刷新 token + 认证，雪上加霜。

### 5. 添加连接复用日志
```typescript
console.log(`[imap] reusing pooled connection for ${email}`);
console.log(`[imap] opening new connection for ${email}`);
```

**用途**: 生产环境可监控连接复用率，验证优化效果。

## 预期效果

### 优化前
- 用户 2 分钟内多次操作 → 每次新认证 → 触发限流 → 报错

### 优化后
- 用户 15 分钟内多次操作 → 复用同一连接 → 无新认证 → 不触发限流
- 连接空闲时自动保活 → 延长单次认证的有效使用时长
- 即使触发限流，3 分钟冷却期足够微软限流窗口恢复

## 测试建议

1. **正常场景**: 同一账号 1 分钟内连续请求 5-10 次，应全部成功且日志显示 "reusing pooled connection"
2. **空闲恢复**: 请求一次后等待 2 分钟再请求，应仍复用连接（NOOP 保活生效）
3. **限流恢复**: 如果触发限流，等待 3 分钟后应能正常访问
4. **长时间空闲**: 等待 16 分钟后请求，应创建新连接（TTL 过期，属正常行为）

## 进一步优化方向（可选）

1. **主动监控限流信号**: 检测到接近限流阈值时，主动降低请求频率
2. **账号级请求队列**: 对高频操作的账号实施请求排队，强制串行化
3. **多账号轮询**: 如果有多个相同邮箱的凭证，轮流使用分散压力
