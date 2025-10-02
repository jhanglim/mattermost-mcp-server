import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";

// Mattermost 설정
const MATTERMOST_URL = process.env.MATTERMOST_URL || "https://your-mattermost-server.com";
const MATTERMOST_TOKEN = process.env.MATTERMOST_TOKEN || "";

interface MattermostConfig {
  url: string;
  token: string;
}

interface MattermostPost {
  id: string;
  message: string;
  user_id: string;
  channel_id: string;
  create_at: number;
  update_at: number;
}

interface MattermostSearchResult {
  order: string[];
  posts: Record<string, MattermostPost>;
}

interface MattermostPostsResult {
  order: string[];
  posts: Record<string, MattermostPost>;
}

interface MattermostUser {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  nickname: string;
  email?: string;
}

// KST 변환 헬퍼 함수
function formatTimestamp(timestamp: number) {
  const kstDate = new Date(timestamp + 9 * 60 * 60 * 1000);
  return kstDate.toISOString().replace('Z', '+09:00');
}

class MattermostClient {
  private config: MattermostConfig;
  private userCache: Map<string, any> = new Map();

  constructor(config: MattermostConfig) {
    this.config = config;
  }

  private async request(endpoint: string, options: any = {}) {
    const url = `${this.config.url}/api/v4${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Mattermost API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async searchPosts(terms: string, isOrSearch: boolean = false): Promise<MattermostSearchResult> {
    return await this.request("/posts/search", {
      method: "POST",
      body: JSON.stringify({
        terms,
        is_or_search: isOrSearch,
      }),
    }) as MattermostSearchResult;
  }

  async searchUsers(term: string): Promise<MattermostUser[]> {
    return await this.request("/users/search", {
      method: "POST",
      body: JSON.stringify({
        term,
        allow_inactive: false,
      }),
    }) as MattermostUser[];
  }

  async getUserByUsername(username: string): Promise<MattermostUser> {
    return await this.request(`/users/username/${username}`) as MattermostUser;
  }

  async getUser(userId: string) {
    // 캐시 확인
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId);
    }

    try {
      const user = await this.request(`/users/${userId}`);
      this.userCache.set(userId, user);
      return user;
    } catch (e) {
      return null;
    }
  }

  async getUsersInfo(userIds: string[]) {
    const userMap = new Map();
    
    for (const userId of userIds) {
      const user = await this.getUser(userId);
      if (user) {
        userMap.set(userId, {
          username: user.username,
          name: `${user.first_name} ${user.last_name}`.trim() || user.nickname || user.username,
        });
      } else {
        userMap.set(userId, { username: "unknown", name: "Unknown User" });
      }
    }
    
    return userMap;
  }

  async getMe(): Promise<MattermostUser> {
    return await this.request("/users/me") as MattermostUser;
  }

  async getChannel(channelId: string) {
    return await this.request(`/channels/${channelId}`);
  }

  async getTeams() {
    return await this.request("/users/me/teams");
  }

  async getChannelsForTeam(teamId: string) {
    return await this.request(`/users/me/teams/${teamId}/channels`);
  }

  async getPost(postId: string) {
    return await this.request(`/posts/${postId}`);
  }

  async getPostThread(postId: string): Promise<MattermostPostsResult> {
    return await this.request(`/posts/${postId}/thread`) as MattermostPostsResult;
  }

  async getChannelMessages(channelId: string, page: number = 0, perPage: number = 60): Promise<MattermostPostsResult> {
    return await this.request(`/channels/${channelId}/posts?page=${page}&per_page=${perPage}`) as MattermostPostsResult;
  }
}

const server = new Server(
  {
    name: "mattermost-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const client = new MattermostClient({
  url: MATTERMOST_URL,
  token: MATTERMOST_TOKEN,
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_current_user",
        description: "현재 토큰 소유자(나)의 정보를 조회합니다.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_user_info",
        description: "사용자 ID로 사용자의 상세 정보를 조회합니다. username, 이름, 닉네임 등을 확인할 수 있습니다.",
        inputSchema: {
          type: "object",
          properties: {
            user_id: {
              type: "string",
              description: "조회할 사용자의 ID",
            },
          },
          required: ["user_id"],
        },
      },
      {
        name: "search_messages",
        description: "Mattermost에서 메시지를 검색합니다. 키워드, 사용자명(@username 또는 from:username), 날짜 등으로 검색할 수 있습니다. 검색 결과에는 자동으로 작성자의 이름(user_name)과 username이 포함됩니다.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "검색할 키워드 또는 검색어. 사용자명으로 검색하려면 'from:username' 또는 '@username' 형식 사용",
            },
            is_or_search: {
              type: "boolean",
              description: "true인 경우 OR 검색, false인 경우 AND 검색 (기본값: false)",
              default: false,
            },
          },
          required: ["query"],
        },
      },
      {
        name: "search_user_messages",
        description: "특정 사용자의 메시지를 이름이나 username으로 검색합니다. '박찬우', 'cwpark' 등으로 검색 가능.",
        inputSchema: {
          type: "object",
          properties: {
            user_name: {
              type: "string",
              description: "검색할 사용자의 이름 또는 username (예: '박찬우', 'cwpark')",
            },
            keyword: {
              type: "string",
              description: "추가로 검색할 키워드 (선택사항)",
            },
          },
          required: ["user_name"],
        },
      },
      {
        name: "search_users",
        description: "사용자를 이름, username, 닉네임으로 검색합니다.",
        inputSchema: {
          type: "object",
          properties: {
            search_term: {
              type: "string",
              description: "검색할 이름, username 또는 닉네임",
            },
          },
          required: ["search_term"],
        },
      },
      {
        name: "get_teams",
        description: "현재 사용자가 속한 모든 팀 목록을 가져옵니다.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_channels",
        description: "특정 팀의 채널 목록을 가져옵니다.",
        inputSchema: {
          type: "object",
          properties: {
            team_id: {
              type: "string",
              description: "팀 ID",
            },
          },
          required: ["team_id"],
        },
      },
      {
        name: "get_channel_messages",
        description: "특정 채널의 최근 메시지들을 가져옵니다. 결과에는 자동으로 작성자의 이름(user_name)과 username이 포함됩니다.",
        inputSchema: {
          type: "object",
          properties: {
            channel_id: {
              type: "string",
              description: "채널 ID",
            },
            page: {
              type: "number",
              description: "페이지 번호 (기본값: 0)",
              default: 0,
            },
            per_page: {
              type: "number",
              description: "페이지당 메시지 수 (기본값: 60)",
              default: 60,
            },
          },
          required: ["channel_id"],
        },
      },
      {
        name: "get_post_thread",
        description: "특정 게시물의 전체 스레드를 가져옵니다. 결과에는 자동으로 작성자의 이름(user_name)과 username이 포함됩니다.",
        inputSchema: {
          type: "object",
          properties: {
            post_id: {
              type: "string",
              description: "게시물 ID",
            },
          },
          required: ["post_id"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("Arguments are required");
    }

    switch (name) {
      case "get_current_user": {
        const me = await client.getMe();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                id: me.id,
                username: me.username,
                email: me.email || "",
                first_name: me.first_name || "",
                last_name: me.last_name || "",
                nickname: me.nickname || "",
                full_name: `${me.first_name} ${me.last_name}`.trim() || me.nickname || me.username,
              }, null, 2),
            },
          ],
        };
      }

      case "get_user_info": {
        const userId = args.user_id as string;
        const user = await client.getUser(userId);
        
        if (!user) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "User not found",
                  user_id: userId,
                }, null, 2),
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                id: user.id,
                username: user.username,
                email: user.email || "",
                first_name: user.first_name || "",
                last_name: user.last_name || "",
                nickname: user.nickname || "",
                full_name: `${user.first_name} ${user.last_name}`.trim() || user.nickname || user.username,
              }, null, 2),
            },
          ],
        };
      }

      case "search_messages": {
        const query = args.query as string;
        const isOrSearch = (args.is_or_search as boolean) || false;
        
        const result = await client.searchPosts(query, isOrSearch);

        // 고유한 user_id 추출
        const uniqueUserIds = [...new Set(result.order?.map((postId: string) => result.posts[postId].user_id) || [])];
        
        // 사용자 정보 일괄 조회
        const userMap = await client.getUsersInfo(uniqueUserIds);

        // 검색 결과 포맷팅
        const posts = result.order?.map((postId: string) => {
          const post = result.posts[postId];
          const createTime = formatTimestamp(post.create_at);
          const updateTime = formatTimestamp(post.update_at);
          const userInfo = userMap.get(post.user_id);
          
          return {
            id: post.id,
            message: post.message,
            user_id: post.user_id,
            username: userInfo?.username || "unknown",
            user_name: userInfo?.name || "Unknown User",
            channel_id: post.channel_id,
            create_at: createTime,
            update_at: updateTime,
          };
        }) || [];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                total_count: posts.length,
                posts: posts,
              }, null, 2),
            },
          ],
        };
      }

      case "search_user_messages": {
        const userName = args.user_name as string;
        const keyword = (args.keyword as string) || "";
        
        // 먼저 사용자 검색
        let users: MattermostUser[] = [];
        try {
          // username으로 직접 조회 시도
          const user = await client.getUserByUsername(userName);
          users = [user];
        } catch {
          // 실패하면 검색으로 시도
          users = await client.searchUsers(userName);
        }

        if (users.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: `사용자 '${userName}'를 찾을 수 없습니다.`,
                  total_count: 0,
                  posts: [],
                }, null, 2),
              },
            ],
          };
        }

        // 첫 번째 매칭된 사용자의 메시지 검색
        const user = users[0];
        const searchQuery = keyword 
          ? `from:${user.username} ${keyword}`
          : `from:${user.username}`;
        
        const result = await client.searchPosts(searchQuery, false);

        // 고유한 user_id 추출 및 사용자 정보 조회
        const uniqueUserIds = [...new Set(result.order?.map((postId: string) => result.posts[postId].user_id) || [])];
        const userMap = await client.getUsersInfo(uniqueUserIds);

        const posts = result.order?.map((postId: string) => {
          const post = result.posts[postId];
          const createTime = formatTimestamp(post.create_at);
          const updateTime = formatTimestamp(post.update_at);
          const userInfo = userMap.get(post.user_id);
          
          return {
            id: post.id,
            message: post.message,
            user_id: post.user_id,
            username: userInfo?.username || "unknown",
            user_name: userInfo?.name || "Unknown User",
            channel_id: post.channel_id,
            create_at: createTime,
            update_at: updateTime,
          };
        }) || [];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                found_user: {
                  id: user.id,
                  username: user.username,
                  name: `${user.first_name} ${user.last_name}`.trim() || user.nickname,
                },
                total_count: posts.length,
                posts: posts,
              }, null, 2),
            },
          ],
        };
      }

      case "search_users": {
        const searchTerm = args.search_term as string;
        const users = await client.searchUsers(searchTerm);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                total_count: users.length,
                users: users.map(u => ({
                  id: u.id,
                  username: u.username,
                  name: `${u.first_name} ${u.last_name}`.trim() || u.nickname,
                  nickname: u.nickname,
                })),
              }, null, 2),
            },
          ],
        };
      }

      case "get_teams": {
        const teams = await client.getTeams();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(teams, null, 2),
            },
          ],
        };
      }

      case "get_channels": {
        const teamId = args.team_id as string;
        const channels = await client.getChannelsForTeam(teamId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(channels, null, 2),
            },
          ],
        };
      }

      case "get_channel_messages": {
        const channelId = args.channel_id as string;
        const page = (args.page as number) || 0;
        const perPage = (args.per_page as number) || 60;
        
        const messages = await client.getChannelMessages(channelId, page, perPage);

        // 고유한 user_id 추출 및 사용자 정보 조회
        const uniqueUserIds = [...new Set(messages.order?.map((postId: string) => messages.posts[postId].user_id) || [])];
        const userMap = await client.getUsersInfo(uniqueUserIds);

        const posts = messages.order?.map((postId: string) => {
          const post = messages.posts[postId];
          const createTime = formatTimestamp(post.create_at);
          const userInfo = userMap.get(post.user_id);
          
          return {
            id: post.id,
            message: post.message,
            user_id: post.user_id,
            username: userInfo?.username || "unknown",
            user_name: userInfo?.name || "Unknown User",
            create_at: createTime,
          };
        }) || [];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                channel_id: channelId,
                posts: posts,
              }, null, 2),
            },
          ],
        };
      }

      case "get_post_thread": {
        const postId = args.post_id as string;
        const thread = await client.getPostThread(postId);
        
        // 고유한 user_id 추출 및 사용자 정보 조회
        const uniqueUserIds = [...new Set(thread.order?.map((postId: string) => thread.posts[postId].user_id) || [])];
        const userMap = await client.getUsersInfo(uniqueUserIds);

        const posts = thread.order?.map((postId: string) => {
          const post = thread.posts[postId];
          const createTime = formatTimestamp(post.create_at);
          const userInfo = userMap.get(post.user_id);
          
          return {
            id: post.id,
            message: post.message,
            user_id: post.user_id,
            username: userInfo?.username || "unknown",
            user_name: userInfo?.name || "Unknown User",
            create_at: createTime,
          };
        }) || [];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                posts: posts,
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mattermost MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
