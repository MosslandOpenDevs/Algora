# Algora 모바일 지원 계획

## 현재 문제점 분석

### 1. 사이드바 (Sidebar.tsx)
- **문제**: 고정 너비 `w-64` (256px)로 모바일에서 화면의 대부분을 차지
- **원인**: 반응형 브레이크포인트 없음
- **영향**: 모바일에서 콘텐츠 영역이 거의 보이지 않음

### 2. 헤더 (Header.tsx)
- **문제**: 많은 정보가 수평으로 배치 (시스템 상태, 예산, Next Tier2, Queue)
- **원인**: 모바일 브레이크포인트 없이 `flex` 레이아웃
- **영향**: 모바일에서 텍스트가 겹치거나 잘림

### 3. 메인 레이아웃 (layout.tsx)
- **문제**: 사이드바가 항상 표시됨, 모바일 네비게이션 없음
- **원인**: `flex` 레이아웃에서 사이드바 숨김 처리 없음
- **영향**: 모바일에서 사용 불가

### 4. 콘텐츠 영역
- **문제**: 고정 패딩 `p-6` (24px)
- **영향**: 작은 화면에서 콘텐츠 공간 부족

---

## 모바일 대응 전략

### Phase 1: 레이아웃 기반 구축 (핵심)

#### 1.1 MobileNav 컴포넌트 생성
```
apps/web/src/components/layout/MobileNav.tsx
```
- 햄버거 메뉴 버튼
- 슬라이드 아웃 사이드바
- 오버레이 배경
- 바텀 네비게이션 (선택적)

#### 1.2 Sidebar 반응형 수정
```tsx
// 데스크톱: 항상 표시
// 태블릿: 축소 버전 (아이콘만)
// 모바일: 숨김 (햄버거 메뉴로 접근)

<aside className="hidden md:flex w-64 lg:w-64 md:w-16 ...">
```

#### 1.3 Header 반응형 수정
```tsx
// 모바일: 로고 + 햄버거 + 핵심 버튼만
// 데스크톱: 전체 정보 표시

<div className="hidden md:flex items-center gap-6">
  {/* 시스템 상태, 예산, 등 */}
</div>
```

#### 1.4 Layout 반응형 수정
```tsx
<main className="flex-1 overflow-auto p-4 md:p-6">
  {children}
</main>
```

### Phase 2: 컴포넌트별 반응형

#### 2.1 대시보드 페이지
- 통계 카드: `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`
- 활동 피드: 전체 너비 사용

#### 2.2 에이전트 그리드
- `grid-cols-3` → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`

#### 2.3 프로포절 카드
- 버튼 크기 조정
- 투표 바 모바일 최적화

#### 2.4 모달 컴포넌트
- 전체 화면 모달 (모바일)
- 바텀 시트 스타일 옵션

### Phase 3: 터치 최적화

#### 3.1 터치 타겟 크기
- 최소 44x44px 확보
- 버튼 패딩 증가

#### 3.2 스와이프 제스처
- 사이드바 스와이프 열기/닫기
- 카드 스와이프 액션

#### 3.3 풀 다운 새로고침
- 활동 피드에 적용

---

## 파일 수정 목록

### 신규 생성
```
apps/web/src/components/layout/MobileNav.tsx       # 모바일 네비게이션
apps/web/src/components/layout/MobileHeader.tsx    # 모바일 헤더
apps/web/src/components/layout/BottomNav.tsx       # 바텀 네비게이션 (선택)
apps/web/src/hooks/useMobile.ts                    # 모바일 감지 훅
apps/web/src/hooks/useSwipe.ts                     # 스와이프 제스처 훅
```

### 수정
```
apps/web/src/components/layout/Sidebar.tsx         # 반응형 추가
apps/web/src/components/layout/Header.tsx          # 반응형 추가
apps/web/src/app/[locale]/layout.tsx               # 레이아웃 구조 변경
apps/web/src/app/[locale]/page.tsx                 # 대시보드 반응형
apps/web/src/components/agents/AgentGrid.tsx       # 그리드 반응형
apps/web/src/components/proposals/*.tsx            # 프로포절 반응형
apps/web/src/components/activity/*.tsx             # 활동 피드 반응형
```

---

## 브레이크포인트 전략

```
sm: 640px   - 소형 태블릿
md: 768px   - 태블릿 (사이드바 축소)
lg: 1024px  - 소형 데스크톱 (사이드바 확장)
xl: 1280px  - 대형 데스크톱
```

### 레이아웃 변화
| 화면 | 사이드바 | 헤더 | 네비게이션 |
|------|----------|------|------------|
| < 768px | 숨김 | 간소화 | 햄버거 + 바텀 |
| 768-1024px | 아이콘만 | 일부 정보 | 사이드바 |
| > 1024px | 전체 | 전체 | 사이드바 |

---

## 구현 순서

### Step 1: 기본 인프라 (1-2시간)
1. `useMobile` 훅 생성
2. `MobileNav` 컴포넌트 생성
3. 레이아웃에 조건부 렌더링 추가

### Step 2: 레이아웃 반응형 (2-3시간)
1. `Sidebar` 반응형 수정
2. `Header` 반응형 수정
3. `layout.tsx` 구조 변경

### Step 3: 페이지별 최적화 (3-4시간)
1. 대시보드 페이지
2. 에이전트 페이지
3. 프로포절 페이지
4. Agora 페이지

### Step 4: 터치 최적화 (1-2시간)
1. 터치 타겟 크기 조정
2. 스와이프 제스처 추가
3. 풀 다운 새로고침

---

## 테스트 체크리스트

### 디바이스
- [ ] iPhone SE (375px)
- [ ] iPhone 14 (390px)
- [ ] iPhone 14 Pro Max (430px)
- [ ] iPad Mini (768px)
- [ ] iPad Pro (1024px)

### 기능
- [ ] 햄버거 메뉴 열기/닫기
- [ ] 페이지 네비게이션
- [ ] 스크롤 성능
- [ ] 터치 반응성
- [ ] 모달 표시
- [ ] 폼 입력

### 성능
- [ ] 초기 로드 시간
- [ ] 인터랙션 지연
- [ ] 메모리 사용량

---

## 예상 결과

| 지표 | 현재 | 목표 |
|------|------|------|
| 모바일 사용성 점수 | 낮음 | 90+ |
| 터치 타겟 준수율 | 50% | 100% |
| 모바일 LCP | N/A | < 2.5s |
| 모바일 CLS | N/A | < 0.1 |

---

**작성일**: 2026-01-15
**예상 소요 시간**: 8-12시간
