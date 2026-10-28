# 주영런처

마인크래프트 서버 런처예요.

- 마이크로소프트 정품 로그인
- 자바, 마인크래프트, Fabric, 미니맵 모드(Xaero's Minimap / World Map), Sodium 자동 설치
- 게임 시작 시 서버 자동 접속
- 설정과 런처 자체가 자동으로 업데이트돼요

## 친구들: 설치 방법
[최신 릴리스](https://github.com/chlwndud0122/rpg-launcher/releases/latest)에서 `RPG-Launcher-Setup.exe`를 받아 실행하세요.

## 서버 관리자: 설정 바꾸기
`launcher.config.json` 파일만 고치면 돼요. 친구들 런처는 다음에 켤 때 바로 새 설정을 적용해요(최대 5분 정도 걸릴 수 있어요).

| 항목 | 뜻 |
|---|---|
| `serverName` / `subtitle` | 런처에 보이는 서버 이름과 소개 |
| `serverAddress` | 서버 주소 (예: `play.example.com` 또는 `1.2.3.4:25565`). 비워두면 게임만 켜져요 |
| `minecraftVersion` | 마인크래프트 버전 |
| `mods` | Modrinth에서 받을 모드 목록 (Modrinth 주소의 이름 부분) |

## 개발
```bash
npm install
npm start          # 런처 실행
npm run dist       # 설치 파일 만들기 (dist/)
```
런처 자체를 업데이트하려면 `package.json`의 `version`을 올리고 빌드한 뒤, `dist/`의 `RPG-Launcher-Setup.exe`, `.blockmap`, `latest.yml`을 GitHub 릴리스에 올리면 돼요.

## 보안
- 로그인 정보는 Windows 암호화(DPAPI)로 저장돼요. 기록 파일(`launcher-log.txt`)에는 로그인 토큰이 남지 않아요.
- 설정 파일은 GitHub에서 받아도 검사를 통과한 값만 써요(경로 조작, 명령어 끼워넣기 차단).
- 모드는 Modrinth, 자바는 Adoptium에서만 HTTPS로 받고 해시로 확인해요.
- 런처 파일이 변조되면 실행되지 않아요(Electron 퓨즈, asar 무결성 검사).
- 보안 테스트: `npm run test:security`
- **GitHub 계정에 2단계 인증을 꼭 켜두세요.** 자동 업데이트가 이 계정을 통해 배포돼요.
