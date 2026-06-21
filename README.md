# sj_yc12 갤러리

폰에서 사진을 올리면 GitHub 저장소의 `photos` 폴더에 바로 저장되는 갤러리입니다.

## GitHub Pages에서 쓰기

1. 이 폴더 내용을 GitHub 저장소에 올립니다.
2. GitHub Pages를 켭니다.
3. 폰에서 GitHub Pages 주소를 엽니다.
4. 업로드 탭에서 GitHub 토큰을 한 번 저장합니다.
5. 사진을 선택하고 저장합니다.

토큰은 코드에 저장하지 않고 현재 브라우저의 localStorage에만 저장됩니다.

## 토큰 권한

GitHub에서 Fine-grained personal access token을 만들고 다음처럼 설정합니다.

- Repository access: 이 갤러리 저장소만 선택
- Permissions: Contents 권한을 Read and write

토큰을 공개 저장소 코드에 직접 넣으면 안 됩니다.

## 로컬 서버로도 쓰기

PC에서만 빠르게 확인하려면 아래 명령으로 로컬 서버를 켤 수 있습니다.

```powershell
py server.py
```

## 사진 올리기

1. 폰 브라우저에서 서버 주소를 엽니다.
2. `업로드` 탭으로 갑니다.
3. 폴더명을 입력합니다. 비워두면 `기본`으로 저장됩니다.
4. 사진을 여러 장 선택하고 `저장하기`를 누릅니다.

새 폴더명은 자동으로 만들어집니다. 예를 들어 폴더에 `660/야간`이라고 쓰면 `photos/660/야간/` 폴더에 저장됩니다.

## 지원 파일

- 사진: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.avif`
- 영상: `.mp4`, `.webm`, `.mov`
- 문서: `.pdf`
