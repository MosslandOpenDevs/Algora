# Algora 웹사이트 성능 최적화 계획

## 개요

이 문서는 Algora 웹사이트의 성능 최적화를 위한 상세 계획입니다. 프론트엔드와 백엔드 양쪽에서 개선할 수 있는 항목들을 분석하고 우선순위를 정리했습니다.

---

## 현재 분석 결과

### 프론트엔드 (apps/web)
- **컴포넌트 수:** 91개의 `.tsx` 컴포넌트
- **프레임워크:** Next.js 14.1.0, React 18.2.0
- **상태 관리:** @tanstack/react-query
- **스타일링:** Tailwind CSS

### 백엔드 (apps/api)
- **서버:** Express.js + Socket.IO
- **데이터베이스:** SQLite (WAL 모드)
- **서비스:** 30개의 서비스 파일
- **DB 크기:** ~57MB

---

## 🔴 우선순위 높음 (즉시 개선 필요)

### 1. 데이터베이스 인덱스 추가 (예상 작업: 1-2시간)

**문제점:**
- `activity_log`, `signals`, `agora_sessions` 테이블에 적절한 인덱스 부재
- 전체 테이블 스캔으로 인한 쿼리 지연 (100-200ms)

**해결 방법:**
```sql
-- apps/api/src/db/index.ts에 추가
CREATE INDEX IF NOT EXISTS idx_agent_states_status ON agent_states(status);
CREATE INDEX IF NOT EXISTS idx_agora_sessions_status_date ON agora_sessions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp_type ON activity_log(timestamp DESC, type);
CREATE INDEX IF NOT EXISTS idx_signals_category_timestamp ON signals(category, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
```

**예상 효과:** 쿼리 속도 50-80% 개선

---

### 2. HTTP 응답 압축 활성화 (예상 작업: 30분)

**문제점:**
- API 응답이 압축되지 않음
- `/api/activity` 응답이 50KB+ (압축시 ~8KB)

**해결 방법:**
```bash
pnpm add compression @types/compression -D --filter=@algora/api
```

```typescript
// apps/api/src/index.ts
import compression from 'compression';

app.use(compression({
  level: 6,
  threshold: 1024, // 1KB 이상만 압축
}));
```

**예상 효과:** 네트워크 전송량 70-85% 감소

---

### 3. HTTP 캐싱 헤더 추가 (예상 작업: 30분)

**문제점:**
- 모든 API 응답에 캐시 헤더 없음
- 클라이언트가 동일한 데이터를 반복 요청

**해결 방법:**
```typescript
// apps/api/src/middleware/caching.ts 생성
import { Request, Response, NextFunction } from 'express';

const CACHE_CONFIG: Record<string, number> = {
  '/api/stats': 10,        // 10초
  '/api/agents': 30,       // 30초
  '/api/activity': 15,     // 15초
  '/api/issues': 60,       // 60초
  '/api/proposals': 30,    // 30초
};

export function cacheMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'GET') return next();

  for (const [path, maxAge] of Object.entries(CACHE_CONFIG)) {
    if (req.path.startsWith(path)) {
      res.set('Cache-Control', `public, max-age=${maxAge}, must-revalidate`);
      break;
    }
  }
  next();
}
```

**예상 효과:** 네트워크 요청 40% 감소

---

### 4. 통계 쿼리 통합 (예상 작업: 1시간)

**문제점:**
- `/api/stats`에서 10개 이상의 개별 쿼리 실행
- 각 요청마다 DB 왕복 10회

**해결 방법:**
```typescript
// apps/api/src/services/stats.ts 수정
getConsolidatedStats() {
  return this.db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM agent_states WHERE status != 'idle') as activeAgents,
      (SELECT COUNT(*) FROM agora_sessions WHERE status = 'active') as activeSessions,
      (SELECT COUNT(*) FROM signals WHERE created_at > datetime('now', '-24 hours')) as signalsToday,
      (SELECT COUNT(*) FROM issues WHERE status = 'active') as activeIssues,
      (SELECT COUNT(*) FROM proposals WHERE status = 'voting') as activeVotings,
      (SELECT COUNT(*) FROM proposals WHERE status IN ('passed', 'rejected')) as completedProposals
  `).get();
}
```

**예상 효과:** 통계 API 응답 속도 10배 개선

---

### 5. 모달 컴포넌트 지연 로딩 (예상 작업: 2-3시간)

**문제점:**
- 모든 모달이 페이지 로드시 번들에 포함
- 불필요한 JavaScript 로딩 (모달 사용 전에도)

**해결 방법:**
```typescript
// apps/web/src/components/dynamic-modals.ts 생성
import dynamic from 'next/dynamic';

// 스켈레톤 컴포넌트
const ModalSkeleton = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="w-96 h-64 bg-agora-card rounded-lg animate-pulse" />
  </div>
);

export const ProposalDetailModal = dynamic(
  () => import('./proposals/ProposalDetailModal').then(mod => ({ default: mod.ProposalDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

export const AgentDetailModal = dynamic(
  () => import('./agents/AgentDetailModal').then(mod => ({ default: mod.AgentDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

export const ActivityDetailModal = dynamic(
  () => import('./activity/ActivityDetailModal').then(mod => ({ default: mod.ActivityDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);
```

**예상 효과:** 초기 번들 크기 15-20% 감소

---

## 🟡 우선순위 중간 (1-2주 내 개선)

### 6. React Query 캐시 최적화

**문제점:**
- ActivityFeed의 refetchInterval이 10초 (너무 빈번함)
- 페이지별로 캐시 설정이 불일치

**해결 방법:**
```typescript
// apps/web/src/lib/query-config.ts 생성
export const QUERY_CONFIG = {
  activities: {
    staleTime: 30 * 1000,       // 30초 동안 fresh
    gcTime: 5 * 60 * 1000,      // 5분 동안 캐시 유지
    refetchInterval: 20 * 1000, // 20초마다 새로고침
  },
  agents: {
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 60 * 1000,
  },
  proposals: {
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 60 * 1000,
  },
  stats: {
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 30 * 1000,
  }
};

// 사용법:
const { data } = useQuery({
  queryKey: ['activities'],
  queryFn: fetchActivities,
  ...QUERY_CONFIG.activities,
});
```

**예상 효과:** API 호출 50% 감소

---

### 7. WebSocket 메시지 배치 처리

**문제점:**
- 각 상태 변경마다 개별 소켓 메시지 전송
- `io.emit()`이 모든 클라이언트에 브로드캐스트

**해결 방법:**
```typescript
// apps/api/src/services/socket-batcher.ts 생성
import { Server } from 'socket.io';

export class SocketBatcher {
  private queues = new Map<string, any[]>();
  private flushInterval: NodeJS.Timer;

  constructor(private io: Server, intervalMs = 100) {
    this.flushInterval = setInterval(() => this.flush(), intervalMs);
  }

  emit(event: string, data: any) {
    if (!this.queues.has(event)) {
      this.queues.set(event, []);
    }
    this.queues.get(event)!.push(data);
  }

  private flush() {
    for (const [event, messages] of this.queues.entries()) {
      if (messages.length > 0) {
        this.io.emit(`${event}:batch`, messages);
        this.queues.set(event, []);
      }
    }
  }

  stop() {
    clearInterval(this.flushInterval);
  }
}
```

**예상 효과:** WebSocket 오버헤드 70% 감소

---

### 8. 인메모리 캐싱 레이어

**문제점:**
- 모든 요청이 직접 DB 접근
- 자주 변경되지 않는 데이터도 매번 쿼리

**해결 방법:**
```typescript
// apps/api/src/lib/cache.ts 생성
class MemoryCache {
  private cache = new Map<string, { data: any; expires: number }>();

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item || Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    return item.data as T;
  }

  set(key: string, data: any, ttlSeconds: number) {
    this.cache.set(key, {
      data,
      expires: Date.now() + ttlSeconds * 1000
    });
  }

  invalidate(pattern: string) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

export const cache = new MemoryCache();

// 사용법:
function getStats() {
  const cached = cache.get('stats');
  if (cached) return cached;

  const stats = db.prepare('...').get();
  cache.set('stats', stats, 30); // 30초 캐시
  return stats;
}
```

**예상 효과:** DB 쿼리 60% 감소

---

### 9. Next.js 설정 최적화

**문제점:**
- lucide-react 아이콘 임포트 최적화 없음
- 정적 에셋 캐싱 설정 없음

**해결 방법:**
```javascript
// apps/web/next.config.mjs 수정
const nextConfig = {
  reactStrictMode: true,
  compress: true,

  experimental: {
    typedRoutes: true,
    optimizePackageImports: ['lucide-react', '@tanstack/react-query'],
  },

  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }
        ]
      }
    ];
  }
};
```

**예상 효과:** 정적 에셋 캐싱 개선, 번들 크기 10% 감소

---

### 10. 긴 목록 가상화 (react-window)

**문제점:**
- 활동 로그, 투표 기록 등이 전체 DOM에 렌더링
- 수백 개 항목 렌더링 시 성능 저하

**해결 방법:**
```bash
pnpm add react-window --filter=@algora/web
```

```typescript
// apps/web/src/components/VirtualizedList.tsx
import { FixedSizeList } from 'react-window';

interface VirtualizedListProps<T> {
  items: T[];
  height: number;
  itemSize: number;
  renderItem: (item: T, index: number) => React.ReactNode;
}

export function VirtualizedList<T>({
  items,
  height,
  itemSize,
  renderItem
}: VirtualizedListProps<T>) {
  return (
    <FixedSizeList
      height={height}
      itemCount={items.length}
      itemSize={itemSize}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          {renderItem(items[index], index)}
        </div>
      )}
    </FixedSizeList>
  );
}
```

**예상 효과:** 긴 목록 렌더링 90% 개선

---

## 🟢 우선순위 낮음 (추후 고려)

### 11. Tailwind CSS 최적화
- 사용하지 않는 애니메이션 키프레임 제거
- `/live` 페이지 전용 애니메이션 분리

### 12. 서비스 워커 추가
- 오프라인 지원
- 정적 에셋 프리캐싱

### 13. Suspense 바운더리 구현
- 스트리밍 SSR 활성화
- 스켈레톤 UI 추가

### 14. 백그라운드 작업 큐 (Bull/BullMQ)
- Tier 2 LLM 호출을 큐로 이동
- 무거운 작업 비동기 처리

---

## 성능 목표

| 지표 | 현재 (추정) | 목표 |
|------|-------------|------|
| LCP (Largest Contentful Paint) | 4-5초 | < 2.5초 |
| FID (First Input Delay) | ~100ms | < 100ms |
| CLS (Cumulative Layout Shift) | < 0.1 | < 0.1 |
| API 응답 시간 | 200-500ms | < 100ms |
| 초기 JS 번들 | 200-250KB | < 150KB |
| 네트워크 페이로드 | 50-100KB/요청 | < 15KB/요청 |

---

## 구현 로드맵

### Phase 1: 즉시 개선 (1-2일)
| 항목 | 예상 시간 | 효과 |
|------|----------|------|
| DB 인덱스 추가 | 1-2시간 | 쿼리 50-80% 개선 |
| HTTP 압축 활성화 | 30분 | 전송량 70-85% 감소 |
| HTTP 캐싱 헤더 | 30분 | 요청 40% 감소 |

### Phase 2: 핵심 최적화 (3-5일)
| 항목 | 예상 시간 | 효과 |
|------|----------|------|
| 통계 쿼리 통합 | 1시간 | API 10배 빠름 |
| 모달 지연 로딩 | 2-3시간 | 번들 15-20% 감소 |
| React Query 최적화 | 1-2시간 | API 호출 50% 감소 |

### Phase 3: 심층 최적화 (1-2주)
| 항목 | 예상 시간 | 효과 |
|------|----------|------|
| 인메모리 캐싱 | 2-3시간 | DB 쿼리 60% 감소 |
| WebSocket 배치 | 2-3시간 | 소켓 70% 개선 |
| Next.js 설정 | 1시간 | 번들 10% 감소 |
| 목록 가상화 | 2-3시간 | 렌더링 90% 개선 |

---

## 측정 및 모니터링

### 프론트엔드 측정
```bash
# Lighthouse 성능 점수 확인
npx lighthouse https://algora.moss.land --output json

# 번들 분석
pnpm add @next/bundle-analyzer -D --filter=@algora/web
```

### 백엔드 측정
```typescript
// API 응답 시간 로깅
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 100) {
      console.log(`[SLOW] ${req.method} ${req.path} - ${duration}ms`);
    }
  });
  next();
});
```

---

**작성일:** 2026-01-15
**버전:** 1.0
