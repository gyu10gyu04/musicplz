// services/gemini.js — Gemini API 연동
//
// 사용자가 적은 애매한 문장(예: "비 오는 날 창밖 보며 듣던 잔잔한 노래")을
// Spotify 검색에 적합한 키워드로 변환하고, 화면에 보여줄 "AI가 이해한 내용" 문구도
// 함께 만들어줍니다.
//
// Gemini에게 "반드시 JSON으로만 응답하라"고 강하게 지시한 뒤, 응답을 파싱해서 사용합니다.

const GEMINI_MODEL = 'gemini-2.5-flash'; // 가볍고 빠른 모델 — 짧은 해석 작업에 적합
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `너는 음악 검색 도우미야. 사용자가 한국어로 애매하거나 감성적인 문장으로
노래를 찾으려고 할 때, 그 문장에서 의미를 파악해서 Spotify 검색에 쓸 만한
영어 또는 한국어 키워드(장르, 분위기, 가수, 곡 제목 등)를 뽑아내야 해.

반드시 아래 JSON 형식으로만 응답해. 다른 설명, 코드블록 표시(\`\`\`) 없이 순수 JSON만 출력해:
{
  "searchQuery": "Spotify 검색창에 그대로 넣을 검색어 (2~5단어 정도, 영어/한국어 혼용 가능)",
  "tags": ["감지된", "분위기나", "테마", "태그", "목록", "최대5개"],
  "interpretation": "사용자에게 보여줄 한국어 한 문장. 예: '#비 #잔잔 #새벽 분위기의 곡으로 이해했어요'"
}

규칙:
- searchQuery는 실제 검색에 쓰일 거니까 너무 길거나 문장 형태면 안 돼. 핵심 단어 위주로.
- 사용자가 특정 가수나 곡 제목을 언급했으면 그걸 최우선으로 searchQuery에 반영해.
- 사용자가 분위기/상황만 말했으면(예: "이별하고 듣는 노래") 장르+무드 키워드로 변환해.
- interpretation은 "#태그 #태그 분위기의 곡으로 이해했어요" 형식을 기본으로 하되,
  특정 곡/가수를 찾는 경우엔 "~를 찾고 있는 것 같아요"처럼 자연스럽게 바꿔도 돼.`;

/**
 * 사용자 문장을 해석해서 Spotify 검색어 + 화면 표시용 해석 문구를 만듦.
 * @param {string} userQuery - 사용자가 입력한 원문 문장
 * @returns {Promise<{searchQuery: string, tags: string[], interpretation: string}>}
 */
async function interpretSearchQuery(userQuery) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다. ' +
      '.env 파일에 Google AI Studio에서 발급받은 키를 넣어주세요.'
    );
  }

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userQuery }] }],
      generationConfig: {
        temperature: 0.4, // 검색어 변환은 일관성이 중요하므로 낮게 설정
        maxOutputTokens: 200,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini 요청 실패 (status ${res.status}): ${text}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return parseGeminiJson(rawText, userQuery);
}

/**
 * Gemini 응답에서 JSON을 안전하게 파싱.
 * 모델이 코드블록(```json ... ```)으로 감싸서 응답하는 경우도 있어 그 부분을 먼저 벗겨낸다.
 * 파싱이 실패하면, 검색 자체가 완전히 멈추지 않도록 사용자 원문을 그대로 검색어로 쓰는
 * 안전한 기본값(fallback)을 반환한다.
 */
function parseGeminiJson(rawText, fallbackQuery) {
  const cleaned = rawText.trim().replace(/^```json\s*|^```\s*|```$/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      searchQuery: String(parsed.searchQuery || fallbackQuery).slice(0, 100),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map(String) : [],
      interpretation: String(parsed.interpretation || `"${fallbackQuery}"로 검색했어요`),
    };
  } catch (err) {
    // Gemini가 형식을 안 지킨 경우 — 검색이 완전히 막히지 않도록 원문으로 대체
    return {
      searchQuery: fallbackQuery,
      tags: [],
      interpretation: `"${fallbackQuery}"로 검색했어요`,
    };
  }
}

module.exports = { interpretSearchQuery };
