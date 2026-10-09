# IMAP 限流自动重试机制

部署时间: 2026-10-09 15:26

## 新增功能

遇到 IMAP 限流错误时，系统会自动重试，而不是立即返回错误给用户。

### 重试策略

```
限流错误 → 等待10秒 → 重试1 
  ↓ 仍失败
  → 等待30秒 → 重试2
    ↓ 仍失败  
    → 标记冷却 → 返回错误
```

### 时间线

- **首次请求**: 0s - 遇到限流错误
- **第1次重试**: 10s 后 - 清除旧连接，重新认证
- **第2次重试**: 40s 后（10s + 30s）- 再次尝试
- **最终失败**: 40s+ - 如果仍失败，返回限流错误

### 用户体验

**优化前**:
```
用户: 点击查看邮件
系统: ❌ 该账号被微软临时限流，请等待 3-5 分钟后重试
用户: （需要手动等待并重试）
```

**优化后**:
```
用户: 点击查看邮件
系统: ⏳ 加载中...（自动重试，10秒）
系统: ⏳ 仍在加载...（第2次重试，30秒）
系统: ✅ 显示邮件列表 （成功！）
或
系统: ❌ 该账号被微软临时限流，请等待 3-5 分钟后重试 （40秒后仍失败）
```

**好处**:
- 很多瞬时限流会自动恢复
- 用户无需手动重试
- 降低感知错误率
- 最多延迟 40 秒（可接受）

## 实现细节

### 代码位置
`lib/mail.ts` - `withImapRetry()` 函数

### 关键参数
```typescript
const MAX_THROTTLE_RETRIES = 2;
const THROTTLE_RETRY_DELAYS_MS = [10 * 1000, 30 * 1000];
```

### 日志标识

**重试开始**:
```
[imap] throttled user@example.com, will retry with backoff...
```

**每次重试**:
```
[imap] throttle retry 1/2 for user@example.com, waiting 10s...
[imap] attempting throttle retry 1 for user@example.com
```

**重试结果**:
```
[imap] throttle retry 1 failed as auth_throttle  // 仍然限流
[imap] throttle retry 1 failed as auth_invalid   // 凭证问题（停止重试）
// 无日志 = 成功（直接返回结果）
```

## 监控命令

### 查看重试活动
```bash
ssh root@149.88.90.100 "journalctl -u rtmail-helper -f | grep 'throttle retry'"
```

### 统计重试成功率
```bash
# 重试次数
ssh root@149.88.90.100 "journalctl -u rtmail-helper --since today | grep -c 'attempting throttle retry'"

# 最终仍失败的次数（重试2次后还是限流）
ssh root@149.88.90.100 "journalctl -u rtmail-helper --since today | grep 'throttle retry 2/2' | grep -c 'failed as auth_throttle'"
```

## 性能影响

### 单账号影响
- 首次限流：增加 10-40 秒延迟
- 其他请求：通过 mutex 排队，不会并发重试

### 多账号影响
- 每个账号独立的 mutex 和重试
- 账号 A 重试不影响账号 B

### 内存影响
- 重试期间保持连接在队列中
- 影响极小（只是 setTimeout）

## 何时触发重试

✅ **会重试的情况**:
- `auth_throttle` - "User is authenticated but not connected"

❌ **不会重试的情况**:
- `auth_invalid` - Token 失效（立即失败）
- `conn_reset` - 连接断开（有独立的重试逻辑）
- `command_failed` - 命令失败（立即失败）

## 与其他优化的配合

### 连接池（15分钟 TTL）
- 减少需要认证的次数
- 重试时会清除旧连接，强制重新认证

### NOOP 保活（30秒）
- 保持连接活跃，避免过期
- 减少重试的触发频率

### 限流冷却（180秒）
- 只在重试2次都失败后才标记
- 冷却期内不会再触发重试（快速失败）

## 调优建议

### 如果重试太慢（用户等待太久）
```typescript
// 缩短延迟
const THROTTLE_RETRY_DELAYS_MS = [5 * 1000, 15 * 1000]; // 5s, 15s (总计20s)
```

### 如果重试成功率低（都失败了）
```typescript
// 延长延迟，给微软更多恢复时间
const THROTTLE_RETRY_DELAYS_MS = [20 * 1000, 60 * 1000]; // 20s, 60s (总计80s)
```

### 如果想禁用重试
```typescript
const MAX_THROTTLE_RETRIES = 0; // 立即失败，不重试
```

## 预期效果

基于当前数据（限流率 11%）:

**假设重试成功率 50%**:
- 实际限流错误: 11% → **5.5%** ✅
- 用户感知延迟: 10-40秒（仅限流时）

**假设重试成功率 70%**:
- 实际限流错误: 11% → **3.3%** ✅✅
- 用户感知延迟: 同上

**即使重试成功率 0%**:
- 实际限流错误: 仍是 11%（不会更差）
- 用户感知延迟: 增加 40 秒

## 验证方法

### 1. 模拟限流场景
快速连续访问多个不同的新账号，触发限流：
1. 账号 A
2. 账号 B（立即）
3. 账号 C（立即）← 应该触发限流

### 2. 观察日志
```bash
ssh root@149.88.90.100 "journalctl -u rtmail-helper -f | grep -E 'throttle|reusing|opening'"
```

**期望看到**:
```
[imap] opening new connection for accountA@outlook.com
[imap] opening new connection for accountB@outlook.com
[imap] opening new connection for accountC@outlook.com
[imap] error classified as auth_throttle
[imap] throttled accountC@outlook.com, will retry with backoff...
[imap] throttle retry 1/2 for accountC@outlook.com, waiting 10s...
[imap] attempting throttle retry 1 for accountC@outlook.com
// 等待10秒
[imap] reusing pooled connection for accountC@outlook.com  ← 成功！
```

### 3. 前端测试
- 访问一个新账号
- 如果触发限流，前端应该看到加载状态持续 10-40 秒
- 然后要么成功显示邮件，要么显示限流错误

## 注意事项

⚠️ **不要在重试期间刷新页面** - 会取消请求，但服务器仍在重试（浪费资源）

⚠️ **重试是串行的** - 同一账号的多个请求会排队，不会并发重试

✅ **重试是智能的** - 如果遇到凭证失效等不可恢复的错误，立即停止重试

## 与 SteinerkertPurl4748@outlook.com 的关系

这个账号之前报限流，现在：
1. 如果再次访问遇到限流 → 自动重试 10s 后
2. 如果仍限流 → 再重试 30s 后  
3. 如果还是限流 → 返回错误（需要手动等待）

**建议**: 先等待 5 分钟让 IP 冷却，再试这个账号，成功率会更高。
