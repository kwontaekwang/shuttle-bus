# 음성공장 통근버스 모바일 PWA

29개 분할 이미지의 전체 노선을 반영한 정적 웹 앱입니다. 스마트폰 브라우저에서 설치할 수 있고, 서비스 워커 캐시로 오프라인 열람을 지원합니다.

## 구조

- `data/routes.json`: 노선·정류장·시간·탑승위치 주소 **원본 데이터**
- `app.js`: 검색, 필터, 즐겨찾기, 주소 관리 등 **화면 동작**
- `styles.css`: 모바일 UI 스타일
- `service-worker.js`, `manifest.webmanifest`: PWA 설치·오프라인 지원
- `tools/validate_routes.py`: 데이터 구조와 시간 필드 검증

화면 코드와 노선 데이터가 분리되어 있으므로 대부분의 운영 변경은 `data/routes.json`만 수정하면 됩니다.

## 탑승위치 주소 관리

모든 정류장에는 `boardingAddress` 필드가 있으며 현재는 빈 문자열입니다.

```json
{
  "id": "cj-dawn-yeongun-yullyang-s01",
  "name": "동남지구 파라곤아파트 버스정류장",
  "times": ["05:19"],
  "boardingAddress": ""
}
```

1. 앱 우측 상단 **관리** 선택
2. 각 정류장의 `탑승위치 주소` 입력 후 **저장**
3. 같은 브라우저에서는 즉시 표시되고 자동 보관됨
4. **전체 데이터 내보내기**로 주소가 병합된 JSON 백업 가능
5. 조직 공용 데이터로 배포하려면 내보낸 JSON으로 `data/routes.json`을 교체하고 `service-worker.js`의 캐시 버전(`commute-bus-v1`)을 올림

> 브라우저에서 입력한 주소는 해당 기기의 `localStorage`에 저장됩니다. 여러 직원에게 공용 배포하려면 반드시 JSON 파일에 반영해 재배포하세요.

## 노선 추가 / 제외 / 변경

- 추가: `routes` 배열에 새 route 객체 추가
- 제외: 해당 route 객체 삭제
- 시간·정류장 변경: route 내부 `stops` 수정
- 주소 수정: stop의 `boardingAddress` 수정
- 다중 시간표: `timeLabels`와 각 stop의 `times` 배열 순서를 일치시킴
- 정류장별 시간이 없는 퇴근 노선: `timeLabels: []`, `times: []`, 출발시각은 `departureTimes`에 기록

ID는 영문·숫자·하이픈 조합으로 중복되지 않게 유지하세요. 기존 ID를 바꾸면 해당 노선의 사용자 즐겨찾기와 로컬 주소 연결이 끊어질 수 있습니다.

## 로컬 실행

브라우저의 `file://` 방식은 JSON 요청을 막을 수 있으므로 간단한 웹 서버로 실행합니다.

```bash
python3 -m http.server 8080
# http://localhost:8080 접속
```

## 검증

```bash
python3 tools/validate_routes.py
```

## GitHub + Netlify 배포

1. 이 폴더의 파일을 GitHub 저장소 루트에 업로드
2. Netlify에서 **Add new site → Import an existing project**
3. 저장소 연결
4. 정적 앱이므로 Build command는 비우고 Publish directory는 `.` 지정
5. Deploy 후 생성된 HTTPS 주소를 임직원에게 공유

이후 `data/routes.json` 수정 사항을 GitHub에 커밋하면 Netlify가 자동 재배포합니다.
