// Uses Next's development env precedence; never prints credentials or model responses.
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(), true);
const provider = process.env.LLM_PROVIDER ?? (process.env.OPENROUTER_API_KEY ? 'openrouter' : 'gemini');
console.log(`Configured provider: ${provider}`);
if (provider !== 'openrouter') {
  console.error('OpenRouter is not selected. Set LLM_PROVIDER=openrouter to use per-seat models.');
  process.exitCode = 1;
} else if (!process.env.OPENROUTER_API_KEY) {
  console.error('OPENROUTER_API_KEY is missing. Seats will use the built-in strategy.');
  process.exitCode = 1;
} else {
  try {
    const headers = { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` };
    const response = await fetch('https://openrouter.ai/api/v1/key', { headers, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Key verification failed: HTTP ${response.status}`);
    const { data } = await response.json();
    console.log(JSON.stringify({ authenticated: true, usageUSD: data.usage, dailyUsageUSD: data.usage_daily, remainingLimitUSD: data.limit_remaining }, null, 2));
    if (process.argv.includes('--completion')) {
      const model = process.env.OPENROUTER_MODEL ?? 'google/gemini-2.5-flash';
      const result = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'X-Title': 'Poker Face diagnostics' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Return JSON only: {"ok":true}' }], max_tokens: 64, reasoning: { effort: 'low' } }),
        signal: AbortSignal.timeout(12000),
      });
      if (!result.ok) throw new Error(`Completion failed: HTTP ${result.status}`);
      const completion = await result.json();
      if (completion.error || !completion.choices?.[0]?.message?.content) throw new Error('Completion did not return content.');
      console.log(JSON.stringify({ completionSucceeded: true, model: completion.model, costUSD: completion.usage?.cost }, null, 2));
    }
    console.log('This checks a fresh process. /api/health shows actual calls made by the running server; restart npm run dev after replacing credentials.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
