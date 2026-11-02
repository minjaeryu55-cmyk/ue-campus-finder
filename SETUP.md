# UE Campus Finder – 실제 서비스 설정 가이드

앱은 두 가지 모드로 동작합니다.

| 모드 | 언제 | 데이터 | 로그인/이메일 |
|---|---|---|---|
| **데모 모드** | 파일을 직접 열거나 GitHub Pages | 내 기기(localStorage) | 없음 |
| **라이브 모드** | Netlify + 아래 설정 완료 | 서버(Netlify Blobs) — 모든 사용자 공유 | Microsoft 로그인 + 이메일 알림 |

라이브 모드는 `/api/config`가 `MS_CLIENT_ID`를 돌려줄 때 자동으로 켜집니다.

---

## 1. Microsoft 로그인 앱 등록 (Microsoft Entra ID)

1. https://portal.azure.com → **Microsoft Entra ID** → **App registrations** → **New registration**
   - 개인 Microsoft 계정만 있다면 무료 Azure 계정을 먼저 만들어야 할 수 있습니다.
2. 이름: `UE Campus Finder`
3. **Supported account types**: *Accounts in any organizational directory and personal Microsoft accounts*
   (학교 계정만 허용하려면 *this organizational directory only* 대신 아래 `ALLOWED_EMAIL_DOMAINS`를 쓰는 걸 추천)
4. **Redirect URI**: 플랫폼 **Single-page application (SPA)** 선택 →
   `https://lambent-pavlova-1fa1a2.netlify.app/`
   (로컬 테스트용으로 `http://localhost:8888/` 도 추가)
5. **Register** → 화면의 **Application (client) ID** 복사 → 아래 `MS_CLIENT_ID`에 넣습니다.

> 학교(UE) 테넌트가 외부 앱 동의를 막아 두면 로그인 시 “관리자 승인 필요”가 뜰 수 있습니다.
> 그 경우 학교 IT에 승인을 요청하거나, 데모 때는 개인 Microsoft 계정(outlook.com 등)으로 시연하세요.

## 2. 알림 이메일 발송 계정 (SMTP)

가장 쉬운 방법은 Gmail 앱 비밀번호입니다.

1. Google 계정 → 보안 → **2단계 인증** 켜기
2. https://myaccount.google.com/apppasswords → 앱 비밀번호 생성 (16자리)
3. 아래 `SMTP_*` 환경변수에 입력

## 3. Netlify 연결 (드래그&드롭 → Git 배포로 변경)

서버 함수(`netlify/functions`)는 **드래그&드롭 배포로는 동작하지 않습니다.** GitHub 저장소를 연결해야 합니다.

1. Netlify → 기존 사이트(lambent-pavlova-1fa1a2) → **Site configuration → Build & deploy → Link repository**
   → GitHub `minjaeryu55-cmyk/ue-campus-finder` 선택, 브랜치 `main`
2. 빌드 설정은 `netlify.toml`에 들어 있으므로 비워 두면 됩니다.
3. **Site configuration → Environment variables** 에 추가:

| 변수 | 예시 | 필수 |
|---|---|---|
| `MS_CLIENT_ID` | `1a2b3c4d-....` | ✅ |
| `MS_TENANT` | `common` (기본값) | |
| `SMTP_HOST` | `smtp.gmail.com` | ✅ (이메일) |
| `SMTP_PORT` | `465` | |
| `SMTP_USER` | `ue.campus.finder@gmail.com` | ✅ (이메일) |
| `SMTP_PASS` | Gmail 앱 비밀번호 16자리 | ✅ (이메일) |
| `MAIL_FROM` | `UE Campus Finder <ue.campus.finder@gmail.com>` | |
| `APP_URL` | `https://lambent-pavlova-1fa1a2.netlify.app` | |
| `ALLOWED_EMAIL_DOMAINS` | `ue-germany.de,stud.ue-germany.de` | 학교 계정만 허용할 때 |
| `ADMIN_EMAILS` | `lostandfound@ue-germany.de` | 분실물 센터 직원 (모든 물건의 보관기간 수정 가능) |

4. **Deploys → Trigger deploy**

## 4. 동작 확인

1. 사이트 접속 → 홈 상단에 **Sign in with Microsoft** 버튼이 보이면 라이브 모드
2. 계정 A로 로그인 → *I lost something* 등록 (카테고리·색상 선택)
3. 계정 B로 로그인 → 같은 카테고리/색상의 물건을 *I found something*으로 등록
4. 계정 A 메일함에 “Possible match for your …” 메일 도착 → 링크를 누르면 해당 물건 상세 화면이 열림

## 누가 무엇을 할 수 있나

- 비로그인: 검색·지도·상세 보기만 가능
- 로그인 사용자: 분실 등록(→ 이메일 알림), 습득 등록, 소유권 질문에 답해 수령 신청
- 습득자 본인 / `ADMIN_EMAILS`: 상세 화면에서 **보관기간(날짜)과 보관 장소 수정**
- 수령 신청은 사용자당 물건별 5번까지 틀릴 수 있음. 정답·습득자 이메일은 서버 밖으로 나가지 않음

## 테스트

```bash
npm install
npm test
```
