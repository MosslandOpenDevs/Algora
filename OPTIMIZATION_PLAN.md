# Algora Website Performance Optimization Plan

## 개요

이 문서는 Algora 웹사이트의 성능 최적화를 위한 상세 계획입니다. 프론트엔드와 백엔드 양쪽에서 개선할 수 있는 항목들을 분석하고 우선순위를 정리했습니다.

---

## 🔴 우선순위 높음 (즉시 개선 필요)

### 1. 데이터베이스 인덱스 추가

**현재 문제:**
- `activity_log`, `signals`, `agora_sessions` 테이블에 적절한 인덱스 부재
- 전체 테이블 스캔으로 인한 쿼리 지연 (100-200ms)

**개선 방법:**
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

### 2. HTTP 응답 압축 활성화

**현재 문제:**
- API 응답이 압축되지 않음
- `/api/activity` 응답이 50KB+ (압축시 ~8KB)

**개선 방법:**
```typescript
// apps/api/src/index.ts
import compression from 'compression';

app.use(compression({
  level: 6,
  threshold: 1024, // 1KB 이상만 압축
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));
```

**예상 효과:** 네트워크 전송량 70-85% 감소

---

### 3. HTTP 캐싱 헤더 추가

**현재 문제:**
- 모든 API 응답에 캐시 헤더 없음
- 클라이언트가 동일한 데이터를 반복 요청

**개선 방법:**
```typescript
// apps/api/src/middleware/caching.ts
export function cacheMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'GET') return next();

  const cacheConfig: Record<string, number> = {
    '/api/stats': 10,        // 10초
    '/api/agents': 30,       // 30초
    '/api/activity': 15,     // 15초
    '/api/issues': 60,       // 60초
    '/api/proposals': 30,    // 30초
  };

  for (const [path, maxAge] of Object.entries(cacheConfig)) {
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

### 4. 통계 쿼리 통합

**현재 문제:**
- `/api/stats`에서 10개 이상의 개별 쿼리 실행
- 각 요청마다 DB 왕복 10회

**개선 방법:**
```typescript
// apps/api/src/services/stats.ts
getConsolidatedStats() {
  return this.db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM agent_states WHERE status != 'idle') as activeAgents,
      (SELECT COUNT(*) FROM agora_sessions WHERE status = 'active') as activeSessions,
      (SELECT COUNT(*) FROM signals WHERE created_at > datetime('now', '-24 hours')) as signalsToday,
      (SELECT COUNT(*) FROM signals WHERE created_at > datetime('now', '-48 hours') AND created_at <= datetime('now', '-24 hours')) as signalsYesterday,
      (SELECT COUNT(*) FROM issues WHERE status = 'active') as activeIssues,
      (SELECT COUNT(*) FROM proposals WHERE status = 'voting') as activeVotings
  `).get();
}
```

**예상 효과:** 통계 API 응답 속도 10배 개선

---

### 5. 모달 컴포넌트 지연 로딩

**현재 문제:**
- 모든 모달이 페이지 로드시 번들에 포함
- 불필요한 JavaScript 로딩

**개선 방법:**
```typescript
// apps/web/src/components/dynamic-modals.ts
import dynamic from 'next/dynamic';

export const ProposalDetailModal = dynamic(
  () => import('./proposals/ProposalDetailModal').then(mod => ({ default: mod.ProposalDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

export const AgentDetailModal = dynamic(
  () => import('./agents/AgentDetailModal').then(mod => ({ default: mod.AgentDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

// 사용처에서:
{selectedProposal && <ProposalDetailModal proposal={selectedProposal} onClose={...} />}
```

**예상 효과:** 초기 번들 크기 15-20% 감소

---

## 🟡 우선순위 중간 (추후 개선)

### 6. React Query 캐시 최적화

**현재 문제:**
- ActivityFeed의 refetchInterval이 10초 (너무 빈번함)
- 페이지별로 캐시 설정이 불일치

**개선 방법:**
```typescript
// apps/web/src/lib/query-config.ts
export const queryConfig = {
  activities: {
    staleTime: 30 * 1000,      // 30초
    gcTime: 5 * 60 * 1000,     // 5분
    refetchInterval: 20 * 1000, // 20초 (기존 10초에서 증가)
  },
  agents: {
    staleTime: 60 * 1000,      // 60초
    gcTime: 10 * 60 * 1000,    // 10분
    refetchInterval: 60 * 1000, // 60초
  },
  stats: {
    staleTime: 30 * 1000,      // 30초
    gcTime: 5 * 60 * 1000,     // 5분
    refetchInterval: 30 * 1000, // 30초
  },
  proposals: {
    staleTime: 60 * 1000,      // 60초
    gcTime: 10 * 60 * 1000,    // 10분
    refetchInterval: 60 * 1000, // 60초
  }
};
```

**예상 효과:** API 호출 50% 감소

---

### 7. WebSocket 메시지 배치 처리

**현재 문제:**
- 각 상태 변경마다 개별 소켓 메시지 전송
- `io.emit()`이 모든 클라이언트에 브로드캐스트

**개선 방법:**
```typescript
// apps/api/src/services/socket-batcher.ts
class SocketBatcher {
  private queue: Map<string, any[]> = new Map();
  private flushInterval = 100; // 100ms마다 배치 전송

  constructor(private io: Server) {
    setInterval(() => this.flush(), this.flushInterval);
  }

  emit(event: string, data: any) {
    if (!this.queue.has(event)) {
      this.queue.set(event, []);
    }
    this.queue.get(event)!.push(data);
  }

  private flush() {
    for (const [event, messages] of this.queue.entries()) {
      if (messages.length > 0) {
        this.io.emit(`${event}:batch`, messages);
        this.queue.set(event, []);
      }
    }
  }
}
```

**예상 효과:** WebSocket 오버헤드 70% 감소

---

### 8. 인메모리 캐싱 레이어 추가

**현재 문제:**
- 모든 요청이 직접 DB 접근
- 자주 변경되지 않는 데이터도 매번 쿼리

**개선 방법:**
```typescript
// apps/api/src/lib/cache.ts
class SimpleCache {
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
      if (key.includes(pattern)) this.cache.delete(key);
    }
  }
}

export const cache = new SimpleCache();
```

**예상 효과:** DB 쿼리 60% 감소

---

### 9. Next.js 설정 최적화

**현재 문제:**
- 패키지 임포트 최적화 없음
- 폰트 최적화 설정 없음

**개선 방법:**
```javascript
// apps/web/next.config.mjs
const nextConfig = {
  reactStrictMode: true,
  compress: true,  // gzip 압축

  experimental: {
    typedRoutes: true,
    optimizePackageImports: ['lucide-react', '@tanstack/react-query'],
  },

  // 정적 에셋 캐싱
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }
        ]
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' }
        ]
      }
    ];
  }
};
```

**예상 효과:** 정적 에셋 캐싱 개선, 번들 크기 10% 감소

---

### 10. 긴 목록 가상화

**현재 문제:**
- 활동 로그, 투표 기록 등이 전체 렌더링
- 수백 개 항목 렌더링 시 성능 저하

**개선 방법:**
```typescript
// react-window 사용
import { FixedSizeList } from 'react-window';

function ActivityList({ activities }: { activities: Activity[] }) {
  return (
    <FixedSizeList
      height={400}
      itemCount={activities.length}
      itemSize={60}
      width="100%"
    >
      {({ index, style }) => (
        <ActivityItem
          activity={activities[index]}
          style={style}
        />
      )}
    </FixedSizeList>
  );
}
```

**예상 효과:** 긴 목록 렌더링 90% 개선

---

## 🟢 우선순위 낮음 (나중에 고려)

### 11. Tailwind CSS 최적화
- 사용하지 않는 애니메이션 키프레임 제거
- 페이지별 CSS 분할 고려

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

## 구현 순서 권장

### Phase 1 (1-2일)
1. ✅ 데이터베이스 인덱스 추가
2. ✅ HTTP 압축 활성화
3. ✅ HTTP 캐싱 헤더 추가

### Phase 2 (2-3일)
4. 통계 쿼리 통합
5. 모달 지연 로딩
6. React Query 캐시 최적화

### Phase 3 (3-5일)
7. 인메모리 캐싱 레이어
8. WebSocket 메시지 배치
9. Next.js 설정 최적화
10. 긴 목록 가상화

### Phase 4 (추후)
11-14. 기타 최적화 항목

---

## 모니터링 및 측정

### 프론트엔드
- Lighthouse 점수 측정
- Web Vitals 모니터링 (`web-vitals` 패키지)
- 번들 분석 (`@next/bundle-analyzer`)

### 백엔드
- API 응답 시간 로깅
- DB 쿼리 시간 측정 (`EXPLAIN QUERY PLAN`)
- 메모리 사용량 모니터링

---

**작성일:** 2026-01-15
**버전:** 1.0
