const axios = require('axios');

const JUDGE0_URL = 'https://judge0-ce.p.rapidapi.com/submissions';
const POLL_INTERVAL_MS = 1000;
const MAX_POLLS = 20;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Submits code to Judge0, then polls for the result. Polling is capped so a
// stuck submission fails after ~20s instead of polling forever.
async function runOnJudge0({ code, languageId }) {
  const headers = {
    'content-type': 'application/json',
    'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
    'X-RapidAPI-Host': process.env.JUDGE0_API_HOST,
  };
  const params = { base64_encoded: 'false', fields: '*' };

  const { data: { token } } = await axios.post(
    JUDGE0_URL,
    { language_id: languageId || 93, source_code: code },
    { params, headers, timeout: 10000 },
  );

  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const { data } = await axios.get(`${JUDGE0_URL}/${token}`, { params, headers, timeout: 10000 });
    if (data.status.id <= 2) continue; // 1 = queued, 2 = processing

    const output = [];
    if (data.stdout) output.push(...data.stdout.split('\n'));
    if (data.stderr) output.push(`[Error] ${data.stderr}`);
    if (data.compile_output) output.push(`[Compiler Error] ${data.compile_output}`);
    output.push(`[Finished in ${data.time || 0}s, Memory: ${data.memory || 0}KB]`);
    return output;
  }

  return ['[Error] Execution timed out.'];
}

module.exports = { runOnJudge0 };
