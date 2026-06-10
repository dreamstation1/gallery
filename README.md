# sj_yc12 GitHub 사진 자동 갤러리

Firebase 없이 GitHub에 올린 사진을 자동으로 보여주는 버전입니다.

## 파일 구조

```txt
index.html
app.js
style.css
README.md
photos/
```

## 사진 올리는 법

1. GitHub 저장소에서 `photos` 폴더를 엽니다.
2. Add file → Upload files를 누릅니다.
3. 사진, 영상, PDF를 올립니다.
4. Commit changes를 누릅니다.
5. 사이트에서 새로고침을 누릅니다.

## 폴더 만들기

GitHub에서 폴더를 직접 만들 수 없을 때는 이렇게 경로를 넣어 업로드하면 됩니다.

```txt
photos/여행/사진1.jpg
photos/버스/사진2.jpg
photos/야경/사진3.jpg
```

## 저장소 이름 수정

만약 저장소 이름이 `gallery`가 아니면 `app.js` 맨 위를 바꾸세요.

```js
const CONFIG = {
  owner: "dreamstation1",
  repo: "gallery",
  branch: "main",
  photoDir: "photos"
};
```

예를 들어 저장소 이름이 `sj_yc12`면:

```js
repo: "sj_yc12"
```
