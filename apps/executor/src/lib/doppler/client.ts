/**
 * Doppler API 客户端
 * 用于从 Doppler 获取目标数据库配置
 */

const DOPPLER_API_BASE = 'https://api.doppler.com/v3';

export interface DopplerSecrets {
  [key: string]: string;
}

export interface DopplerError {
  messages: string[];
  success: boolean;
}

/**
 * 从 Doppler 获取所有 secrets
 * @param token Doppler Service Token
 */
export async function fetchDopplerSecrets(token: string): Promise<DopplerSecrets> {
  const response = await fetch(
    `${DOPPLER_API_BASE}/configs/config/secrets/download?format=json`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    let errorMessage = `Doppler API error: ${response.status}`;
    try {
      const errorData = (await response.json()) as DopplerError;
      if (errorData.messages?.length > 0) {
        errorMessage = errorData.messages.join(', ');
      }
    } catch {
      // 忽略 JSON 解析错误
    }
    throw new Error(errorMessage);
  }

  // Parse JSON with error handling for malformed responses
  try {
    return (await response.json()) as DopplerSecrets;
  } catch (error) {
    const parseError = error instanceof Error ? error.message : 'Invalid JSON response';
    console.error('[DopplerClient] Failed to parse JSON response:', parseError);
    throw new Error(`Failed to parse Doppler response: ${parseError}`);
  }
}

/**
 * 测试 Doppler Token 连接是否有效
 * @param token Doppler Service Token
 * @returns true 表示连接成功
 */
export async function testDopplerConnection(token: string): Promise<{
  success: boolean;
  secretCount?: number;
  error?: string;
}> {
  try {
    const secrets = await fetchDopplerSecrets(token);
    return {
      success: true,
      secretCount: Object.keys(secrets).length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
