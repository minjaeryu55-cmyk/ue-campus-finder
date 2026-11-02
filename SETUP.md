# UE Campus Finder – 실제 서비스 설정 가이드

앱은 두 가지 모드로 동작합니다.

| 모드 | 언제 | 데이터 | 로그인 / 알림 |
|---|---|---|---|
| **데모 모드** | 파일을 직접 열거나 GitHub Pages | 내 기기(localStorage) | 이메일만 입력하는 데모 로그인, 이 기기 안에서만 알림 |
| **라이브 모드** | Netlify + 아래 설정 완료 | 서버(Netlify Blobs) — 모든 사용자 공유 | 진짜 Microsoft 로그인 + 휴대폰 알림 |

라이브 모드는 Netlify 환경변수에 `MS_CLIENT_ID`가 있으면 자동으로 켜집니다.
필요한 것은 **① Microsoft 앱 등록 → ② 휴대폰 알림 키 → ③ Netlify 연결** 세 단계입니다.

---

## ① Microsoft 로그인 설정 (약 5–10분)

Microsoft에 “UE Campus Finder라는 앱이 Microsoft 로그인을 써도 된다”고 등록하고, **Client ID**(앱 번호)를 받는 단계입니다.

### 1. 등록 화면 열기
1. https://entra.microsoft.com 에 접속해 로그인합니다.
   - **먼저 학교(UE) 계정으로 시도**해 보세요. 학생도 앱을 등록할 수 있게 열어 둔 학교가 많습니다.
   - “권한이 없습니다 / You do not have access”가 나오면 **개인 Microsoft 계정**(outlook.com, hotmail.com 등)으로 로그인합니다.
     개인 계정은 디렉터리가 없어서 막힐 수 있는데, 그때는 https://azure.microsoft.com/free 에서 **무료 Azure 계정**을 만든 뒤 다시 들어옵니다. (본인 확인용 카드 등록이 필요할 수 있지만 무료 범위에서는 요금이 나가지 않습니다.)
2. 왼쪽 메뉴에서 **Applications(애플리케이션) → App registrations(앱 등록)** 을 누릅니다.
   (portal.azure.com 에서는 검색창에 “App registrations” 입력)
3. 위쪽 **+ New registration(새 등록)** 을 누릅니다.

### 2. 등록 정보 입력
| 항목 | 입력값 |
|---|---|
| **Name(이름)** | `UE Campus Finder` — 로그인 화면에 이 이름이 보입니다 |
| **Supported account types(지원되는 계정 유형)** | **Accounts in any organizational directory and personal Microsoft accounts** (모든 조직 디렉터리의 계정 및 개인 Microsoft 계정) |
| **Redirect URI(리디렉션 URI)** | 플랫폼 드롭다운에서 **Single-page application (SPA)** 선택 → `https://lambent-pavlova-1fa1a2.netlify.app/` |

> ⚠️ 플랫폼은 반드시 **Single-page application (SPA)** 이어야 합니다. “Web”을 고르면 로그인 후 오류가 납니다.
> ⚠️ 주소 끝의 `/` 까지 정확히 똑같이 넣으세요.

**Register(등록)** 를 누릅니다.

### 3. Client ID 복사
등록이 끝나면 **Overview(개요)** 화면이 열립니다.
**Application (client) ID** (예: `1a2b3c4d-1111-2222-3333-444455556666`) 옆의 복사 버튼을 눌러 저장해 둡니다. → ③에서 `MS_CLIENT_ID`로 씁니다.

- Client ID는 비밀번호가 아닙니다. 노출돼도 괜찮습니다.
- **Client secret(비밀 키)은 만들 필요가 없습니다.** 이 앱은 비밀 키 없이 동작합니다.
- **API permissions(API 사용 권한)도 바꿀 필요가 없습니다.** 기본값(User.Read)이면 됩니다. 앱은 로그인, 이름, 이메일 주소만 사용합니다.

### 4. (선택) 로컬 테스트 주소 추가
**Authentication(인증)** → Single-page application 아래 **Add URI** → `http://localhost:8888/` 추가 → Save.

### 5. (선택) 로고
**Branding & properties(브랜딩 및 속성)** 에서 `icon-512.png`를 로고로 올리면 로그인 동의 화면에 앱 아이콘이 보입니다.

### 사용자가 보게 되는 로그인 화면
1. 앱에서 **Sign in → Sign in with Microsoft**
2. Microsoft 로그인 페이지 → 학교 계정 선택
3. 처음 한 번만 **“UE Campus Finder에서 다음 권한을 요청합니다: 로그인, 기본 프로필 보기, 이메일 주소 보기”** → **Accept(수락)**
4. 앱으로 돌아오면 홈에 “Signed in as …”가 보임 (따로 회원가입 없음 – 첫 로그인 = 가입)

### 자주 나오는 오류
| 오류 | 원인 / 해결 |
|---|---|
| **AADSTS50011** (redirect URI mismatch) | 등록한 Redirect URI가 사이트 주소와 다름 → ②의 주소를 끝의 `/`까지 똑같이 |
| **AADSTS9002326** | 플랫폼을 “Web”으로 등록함 → Authentication에서 SPA로 다시 추가 |
| **관리자 승인 필요 / Need admin approval** | 학교가 외부 앱 동의를 막아 둠 → 학교 IT에 승인 요청, 또는 시연 때 개인 Microsoft 계정 사용 |
| “unverified(확인되지 않음)” 표시 | 정상입니다. 게시자 인증을 안 한 앱에 항상 붙는 표시입니다 |

---

## ② 휴대폰 알림 키 (VAPID)

휴대폰 알림을 보내려면 키 한 쌍이 필요합니다. Node.js가 설치된 컴퓨터에서 한 번만 실행:

```bash
npx web-push generate-vapid-keys
```

나오는 **Public Key**와 **Private Key**를 ③에서 넣습니다. (Private Key는 GitHub에 올리지 마세요.)

---

## ③ Netlify 연결 (약 5분)

서버 기능(`netlify/functions`)은 **드래그&드롭 배포로는 동작하지 않습니다.** GitHub 저장소를 연결해야 합니다.

1. Netlify → 사이트(lambent-pavlova-1fa1a2) → **Site configuration → Build & deploy → Link repository**
   → GitHub `minjaeryu55-cmyk/ue-campus-finder`, 브랜치 `main`
2. 빌드 설정은 `netlify.toml`에 있으므로 비워 둡니다.
3. **Site configuration → Environment variables** 에 추가:

| 변수 | 값 | 필수 |
|---|---|---|
| `MS_CLIENT_ID` | ①에서 복사한 Application (client) ID | ✅ |
| `VAPID_PUBLIC_KEY` | ②의 Public Key | ✅ |
| `VAPID_PRIVATE_KEY` | ②의 Private Key | ✅ |
| `ADMIN_EMAILS` | 분실물 센터 직원 이메일 (쉼표로 구분) – 모든 물건의 보관기간 수정 가능 | |
| `ALLOWED_EMAIL_DOMAINS` | 예: `ue-germany.de` – 이 도메인 계정만 로그인 허용 | |
| `MS_TENANT` | 기본 `common` (보통 그대로) | |

4. **Deploys → Trigger deploy**

## 동작 확인
1. 사이트 접속 → **Sign in** → Microsoft 로그인 → 홈에 “Signed in as …”
2. 휴대폰 A: 로그인 → *I lost something* 등록 → Alerts에서 **Turn on notifications**
   - Android: Chrome에서 바로 가능 / iPhone: 공유 → **홈 화면에 추가**한 앱에서만 가능 (iOS 16.4+)
3. 휴대폰 B(다른 계정): 같은 카테고리·색상의 물건을 *I found something*으로 등록
4. 휴대폰 A에 “🔔 Possible match …” 알림 → 누르면 그 물건 화면이 열림

## 누가 무엇을 할 수 있나
- 비로그인: 검색·지도·상세 보기
- 로그인 사용자: 분실 등록(→ 휴대폰 알림), 습득 등록, 소유권 질문에 답해 수령 신청
- 습득자 본인 / `ADMIN_EMAILS`: 보관기간(날짜)과 보관 장소 수정
- 수령 신청은 사용자당 물건별 5번까지 틀릴 수 있음. 정답과 습득자 정보는 서버 밖으로 나가지 않음

## 알림이 오는 경우
- 내 분실물과 비슷한 물건이 등록됨 (물건마다 한 번)
- 내가 등록한 습득물의 주인이 확인됨
- 매칭된 물건의 보관기간이 3일 이하로 남음 (`netlify/functions/reminders.mjs`가 하루 한 번 자동 실행)

## 보관 장소 운영시간 바꾸기
`shared.js`의 `PLACES`에 위치와 운영시간이 있습니다. 지금 값은 **예시**이니 실제 시간으로 바꿔 주세요. (요일 숫자: 0=일, 1=월 … 6=토)

## 테스트
```bash
npm install
npm test
```
