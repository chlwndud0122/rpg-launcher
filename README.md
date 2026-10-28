# RPG Launcher

친구들과 함께하는 프라이빗 마인크래프트 RPG 서버 전용 런처예요.

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
