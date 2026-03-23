import OpenAI from 'openai';
import {
  filterOpenAICompatibleModelIds,
  getDefaultProviderModel,
  normalizeOpenAICompatibleBaseUrl,
  OpenAICompatibleProviderConfig,
  OpenAICompatibleProviderId,
  ProviderCapabilities,
} from './LlmProviderProfiles';

export interface ProviderProbeResult {
  success: boolean;
  error?: string;
  normalizedBaseUrl: string;
  testedModel?: string;
  capabilities: ProviderCapabilities;
}

export function createOpenAICompatibleClient(
  provider: OpenAICompatibleProviderId,
  config: OpenAICompatibleProviderConfig
): OpenAI | null {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) return null;

  return new OpenAI({
    apiKey,
    baseURL: normalizeOpenAICompatibleBaseUrl(provider, config.baseUrl),
  });
}

export async function fetchOpenAICompatibleModels(
  provider: OpenAICompatibleProviderId,
  config: OpenAICompatibleProviderConfig
): Promise<Array<{ id: string; label: string }>> {
  const client = createOpenAICompatibleClient(provider, config);
  if (!client) {
    throw new Error('No API key available. Please save a key first.');
  }

  const models = await client.models.list();
  const ids = (models.data || []).map((model: any) => model.id).filter(Boolean);
  const filtered = filterOpenAICompatibleModelIds(provider, ids);

  return filtered.map((id) => ({ id, label: id }));
}

export async function probeOpenAICompatibleProvider(
  provider: OpenAICompatibleProviderId,
  config: OpenAICompatibleProviderConfig
): Promise<ProviderProbeResult> {
  const normalizedBaseUrl = normalizeOpenAICompatibleBaseUrl(provider, config.baseUrl);
  const capabilities: ProviderCapabilities = {
    checkedAt: Date.now(),
    supportsModels: false,
    supportsResponses: false,
    supportsStreaming: false,
    supportsPreviousResponseId: false,
    previousResponseIdPreservesContext: false,
    notes: [],
  };

  try {
    const client = createOpenAICompatibleClient(provider, config);
    if (!client) {
      throw new Error('No API key provided');
    }

    const modelsResponse = await client.models.list();
    const allIds = (modelsResponse.data || []).map((model: any) => model.id).filter(Boolean);
    const filteredModels = filterOpenAICompatibleModelIds(provider, allIds);
    const testedModel =
      config.preferredModel?.trim() ||
      (filteredModels.includes(getDefaultProviderModel(provider, 'preferred'))
        ? getDefaultProviderModel(provider, 'preferred')
        : filteredModels[0]);

    capabilities.supportsModels = true;
    capabilities.notes.push(`models:${filteredModels.length}`);

    if (!testedModel) {
      return {
        success: false,
        error: 'No compatible model was discovered for this provider.',
        normalizedBaseUrl,
        capabilities,
      };
    }

    const textResponse = await client.responses.create({
      model: testedModel,
      instructions: '你是连接测试助手。请严格按要求返回指定 token。',
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: '请原样只返回：ok' }],
        },
      ],
      max_output_tokens: 32,
    });
    capabilities.supportsResponses = true;
    capabilities.notes.push(`text:${textResponse.output_text || ''}`);

    const stream = await client.responses.create({
      model: testedModel,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: '请原样只返回：stream-ok' }],
        },
      ],
      max_output_tokens: 32,
      stream: true,
    });

    let sawStreamingDelta = false;
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        sawStreamingDelta = true;
      }
      if (event.type === 'response.completed') {
        break;
      }
    }
    capabilities.supportsStreaming = sawStreamingDelta;
    capabilities.notes.push(`stream:${sawStreamingDelta ? 'delta' : 'no-delta'}`);

    const secret = `token-${Math.random().toString(36).slice(2, 10)}`;
    const first = await client.responses.create({
      model: testedModel,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: `Remember this token for the next turn: ${secret}. Reply only with: noted` }],
        },
      ],
      max_output_tokens: 32,
    });

    if (first.id) {
      const second = await client.responses.create({
        model: testedModel,
        previous_response_id: first.id,
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: 'What token did I ask you to remember? Reply only with the token.' }],
          },
        ],
        max_output_tokens: 32,
      });
      capabilities.supportsPreviousResponseId = true;
      capabilities.previousResponseIdPreservesContext = !!second.output_text?.includes(secret);
      capabilities.notes.push(
        `previous_response_id:${capabilities.previousResponseIdPreservesContext ? 'semantic' : 'accepted-without-context'}`
      );
    }

    return {
      success: capabilities.supportsResponses,
      normalizedBaseUrl,
      testedModel,
      capabilities,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.error?.message || error?.message || 'Connection failed',
      normalizedBaseUrl,
      capabilities,
    };
  }
}
