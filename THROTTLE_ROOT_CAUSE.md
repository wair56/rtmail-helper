# Microsoft IMAP 限流问题根因分析与修复

## 问题现象

用户频繁遇到"该账号被微软临时限流（IMAP 认证过于频繁），请等待 1-2 分钟后重试"

## 根本原因（Critical Bug）

**连接池 Token 不匹配问题** - 这是触发限流的真正元凶：

### 时间轴分析：

```
T=0:00  用户访问 → getAccessToken() 返回 token_1 → 创建 IMAP 连接 A → 放入池
        池: { email: xxx, client: A, accessToken: token_1 }

T=8:01  token_1 过期（TOKEN_CACHE_MS = 8分钟），缓存清空
        用户再次访问 → getAccessToken() 刷新 → 返回 token_2

T=8:01  openMicrosoftImap(email, token_2) 检查池：
        - 找到连接 A（创建时间 < 15分钟，未过期）
        - ❌ BUG: 没有验证 token_1 vs token_2 是否匹配
        - client.usable = true → 直接复用连接 A

T=8:01  【灾难】用 token_1 创建的连接 A，去执行需要 token_2 的命令
        微软服务器检测到 token 不匹配 → 触发限流保护机制 💥
```

### 为什么会发生：

1. **Token 缓存时间 8 分钟** < **连接池 TTL 15 分钟**
2. **连接池只用 email 做 key**，没有存储和验证 `accessToken`
3. Token 刷新后，池中旧连接（用旧 token 创建）仍然被复用
4. 微软服务器将"用错误 token 操作"识别为**可疑行为** → 立即限流

### 为什么之前没被发现：

- 开发环境测试时，通常在 8 分钟内完成，token 未刷新
- 用户连续操作间隔短于 8 分钟时，用的是同一个 token，看起来正常
- 一旦用户：
  - 打开页面 → 8 分钟后再刷新
  - 长时间保持页面打开 → token 后台刷新
  - **立即触发限流！**

## 修复方案

### 1. 连接池存储 accessToken（核心修复）

```typescript
// 之前
const imapPool = new Map<string, { 
  client: ImapFlow; 
  lastUsed: number; 
}>();

// 修复后
const imapPool = new Map<string, { 
  client: ImapFlow; 
  lastUsed: number; 
  accessToken: string;  // ← 存储 token
  keepaliveTimer?: NodeJS.Timeout;
}>();
```

### 2. 复用前验证 Token 匹配

```typescript
const existing = imapPool.get(email);
if (existing) {
  // ✅ Token 不匹配 → 丢弃旧连接，重建
  if (existing.accessToken !== accessToken) {
    console.log(`[imap] token mismatch, discarding old connection`);
    imapPool.delete(email);
    existing.client.logout().catch(() => {});
    // 继续创建新连接
  } else {
    // Token 匹配 → 安全复用
    if (existing.client.usable) {
      return existing.client;
    }
  }
}
```

### 3. 创建连接时存储 Token

```typescript
await client.connect();
imapPool.set(email, { 
  client, 
  lastUsed: Date.now(), 
  accessToken  // ← 存储当前 token
});
```

## 其他优化（辅助改进）

这些改进有助于减少认证频率，但不是根本解决方案：

1. **延长连接池 TTL: 90s → 15min**
   - 减少连接重建频率
   - 单次认证服务更长时间

2. **NOOP Keepalive 机制**
   - 连接空闲 30s 后自动发送 NOOP 命令
   - 保持连接活跃，避免服务器单方面断开
   - NOOP 不触发新的认证

3. **延长限流冷却期: 90s → 180s**
   - 给微软限流窗口更充分恢复时间
   - 避免冷却期不够导致二次限流

## 验证测试

### 复现场景：

1. 用户登录 → 打开 dashboard（触发 IMAP 连接，用 token_1）
2. 等待 9 分钟（超过 TOKEN_CACHE_MS）
3. 刷新页面 → token 自动刷新为 token_2
4. **修复前**：复用旧连接 → 限流
5. **修复后**：检测到 token 不匹配 → 丢弃旧连接 → 用 token_2 创建新连接 → 正常

### 预期行为：

- 日志应显示: `[imap] token mismatch for xxx@outlook.com, discarding old connection`
- 用户操作正常，无限流提示

## 技术债务

建议后续优化：

1. **Token 和连接 TTL 对齐**
   - 将 `IMAP_POOL_TTL_MS` 调整为略小于 `TOKEN_CACHE_MS`（如 7 分钟）
   - 确保连接过期时 token 仍然有效

2. **主动 Token 刷新通知**
   - Token 刷新时主动清理使用旧 token 的连接
   - 避免等到下次请求才发现不匹配

3. **监控 Token 不匹配频率**
   - 添加指标：`imap.token.mismatch.count`
   - 如果频繁发生，说明 TTL 配置不合理

## 影响评估

- **修复前**: 用户每 8-15 分钟访问一次 → 几乎必定触发限流
- **修复后**: Token 不匹配时主动重建连接 → 限流概率降至接近 0
- **性能影响**: Token 刷新时额外一次连接重建（可接受）

---

**修复时间**: 2026-10-10  
**影响范围**: 所有 Microsoft/Outlook 邮箱用户  
**优先级**: P0（严重影响用户体验）
