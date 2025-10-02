# Mattermost MCP Server

Mattermost와 연동되는 Model Context Protocol (MCP) 서버입니다. 이 서버를 통해 Claude가 Mattermost의 메시지 검색, 사용자 조회, 채널 관리, 팀 정보 조회 등을 수행할 수 있습니다.

## 주요 기능

- **사용자 관리**: 현재 사용자 정보 조회, 사용자 검색, 사용자 상세 정보 조회
- **메시지 검색**: 키워드, 사용자명, 날짜를 사용하여 전체 메시지 검색
- **사용자별 메시지 검색**: 특정 사용자의 메시지만 검색
- **팀 관리**: 소속된 팀 목록 조회
- **채널 관리**: 채널 목록 조회 및 채널 메시지 가져오기
- **스레드 조회**: 특정 게시물의 전체 대화 스레드 조회
- **자동 사용자 정보 포함**: 모든 메시지 결과에 작성자의 이름과 username 자동 포함
- **KST 시간 표시**: 모든 타임스탬프가 한국 시간(KST, UTC+9)으로 표시

## 사전 요구사항

- Node.js (v16 이상)
- npm 또는 yarn
- API 접근 권한이 있는 Mattermost 계정
- Mattermost 서버 URL 및 액세스 토큰
- Claude Desktop 앱

## 설치 방법

```bash
# 저장소 클론
git clone https://github.com/jhanglim/mattermost-mcp-server.git
cd mattermost-mcp-server

# 의존성 설치
npm install

# TypeScript 컴파일
npm run build
```

## 설정

### 1. Mattermost 액세스 토큰 발급

1. Mattermost에 로그인
2. **계정 설정** → **보안** → **개인 액세스 토큰**으로 이동
3. **토큰 생성** 클릭
4. 토큰 설명 입력 후 생성
5. 생성된 토큰을 복사 (한 번만 표시됩니다!)

### 2. Claude Desktop 설정

Claude Desktop 설정 파일을 편집하세요:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

다음 내용을 추가:

```json
{
  "mcpServers": {
    "mattermost": {
      "command": "node",
      "args": ["/절대경로/mattermost-mcp-server/build/index.js"],
      "env": {
        "MATTERMOST_URL": "https://your-mattermost-server.com",
        "MATTERMOST_TOKEN": "your-personal-access-token"
      }
    }
  }
}
```

**중요**: 
- `/절대경로/mattermost-mcp-server/`를 실제 프로젝트 경로로 변경하세요
- `build/index.js` 경로를 정확히 지정하세요
- `MATTERMOST_URL`과 `MATTERMOST_TOKEN`을 실제 값으로 변경하세요

### 3. Claude Desktop 재시작

설정을 저장한 후 Claude Desktop을 완전히 종료하고 다시 시작하세요.

## 사용 예시

Claude Desktop에서 다음과 같이 요청할 수 있습니다:

### 기본 검색
- "Mattermost에서 '프로젝트 업데이트' 관련 메시지를 검색해줘"
- "개발 채널의 최근 메시지를 보여줘"
- "내가 속한 모든 팀을 보여줘"

### 사용자 관련
- "내 Mattermost 정보를 알려줘"
- "'홍길동' 사용자를 찾아줘"
- "'jhanglim' 사용자의 메시지를 검색해줘"
- "'박찬우'가 작성한 '배포' 관련 메시지를 찾아줘"

### 고급 검색
- "from:jhanglim 형식으로 특정 사용자의 메시지 검색"
- "@username 형식으로 멘션된 메시지 검색"
- "마케팅 팀의 채널 목록을 알려줘"

## 문제 해결

### MCP 서버가 Claude Desktop에 표시되지 않음

1. `claude_desktop_config.json` 파일 경로가 올바른지 확인
2. JSON 문법이 올바른지 확인 (쉼표, 중괄호 등)
3. 프로젝트 경로가 절대 경로로 정확히 지정되었는지 확인
4. `build/index.js` 파일이 존재하는지 확인 (`npm run build` 실행)
5. Claude Desktop을 완전히 재시작

### 연결 오류

- Mattermost URL이 올바른지 확인 (https:// 포함)
- 액세스 토큰이 유효한지 확인
- Mattermost 서버에 접근 가능한지 확인
- 방화벽이나 프록시 설정 확인

### 권한 오류

- 토큰에 적절한 권한이 있는지 확인
- 팀/채널 멤버십을 확인
- 토큰이 만료되지 않았는지 확인

### 검색 결과가 없음

- 검색어를 확인하세요
- `from:username` 형식이 올바른지 확인
- 사용자가 실제로 메시지를 작성했는지 확인

### 빌드 오류

```bash
# node_modules 삭제 후 재설치
rm -rf node_modules package-lock.json
npm install
npm run build
```

## 보안 주의사항

- ⚠️ 액세스 토큰을 절대 Git에 커밋하지 마세요
- ⚠️ `claude_desktop_config.json`을 공유하지 마세요 (토큰 포함)
- 가능하면 읽기 전용 권한의 토큰을 사용하세요
- 토큰을 정기적으로 갱신하세요
- 더 이상 사용하지 않는 토큰은 삭제하세요

## 라이선스

MIT License - 자세한 내용은 LICENSE 파일을 참조하세요

## 관련 링크

- [Model Context Protocol 문서](https://modelcontextprotocol.io)
- [Mattermost API 문서](https://api.mattermost.com)
- [Claude Desktop](https://claude.ai/desktop)

## 지원

문제가 발생하거나 질문이 있으시면 [GitHub Issues](https://github.com/jhanglim/mattermost-mcp-server/issues)에 등록해주세요.
