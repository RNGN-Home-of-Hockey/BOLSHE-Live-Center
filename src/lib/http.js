// Small fetch wrapper: identifies the project, times out, retries once on network/5xx errors.

export const USER_AGENT =
  'BolsheLiveCenter/0.1 (+https://github.com/RNGN-Home-of-Hockey/BOLSHE-Live-Center)';

export async function fetchText(url, { headers = {}, timeoutMs = 30000, retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status} for ${url}`);
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.permanent = true;
        throw err;
      }
      return await res.text();
    } catch (error) {
      lastError = error;
      if (error.permanent || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  throw lastError;
}

// A source that times out mid-answer sends broken JSON with status 200; retry those too.
export async function fetchJson(url, options = {}) {
  const retries = options.retries ?? 1;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const text = await fetchText(url, options);
    try {
      return JSON.parse(text);
    } catch (error) {
      lastError = new Error(`Broken JSON from ${url.slice(0, 80)}…: ${error.message}`);
    }
  }
  throw lastError;
}
