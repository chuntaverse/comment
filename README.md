# 천타버스 댓글 검색기

SOOP 게시글 주소와 작성자 아이디/닉네임으로 공개 댓글을 찾는 정적 페이지입니다.

## 배포 주소

아래 둘 중 하나로 배포하면 `https://chuntaverse.github.io/comment` 주소를 사용할 수 있습니다.

- `chuntaverse.github.io` 저장소의 `comment` 폴더에 이 파일들을 넣고 GitHub Pages를 켭니다.
- `chuntaverse` 계정/조직에 `comment` 저장소를 만들고 GitHub Pages를 켭니다.

모든 리소스 경로는 상대 경로라서 두 방식 모두에서 동작합니다.

## 파일

- `index.html`: 페이지 구조
- `styles.css`: 화면 스타일
- `app.js`: 댓글 검색 로직
- `assets/logo-1-black@2x.png`: 라이트 모드 상단 중앙 로고
- `assets/logo-1-white@2x.png`: 다크 모드 상단 중앙 로고
- `assets/chaenna-logo.png`: 챈나룽 게시글 주소 입력 버튼 이미지

## 애청자 게시판

애청자 게시판처럼 브라우저에서 바로 댓글 API를 읽기 어려운 게시글은 `애청자 게시판 복사` 버튼으로 콘솔 실행 코드를 복사한 뒤, 해당 SOOP 게시글 페이지의 개발자 도구 Console에서 실행해 하이라이트 댓글 링크를 복사할 수 있습니다.
