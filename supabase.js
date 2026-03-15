/* ── Supabase 연동 (앱인토스 로그 수집) ── */
const _SB_URL = 'https://jdrkoyfieiramkoakpql.supabase.co';
const _SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcmtveWZpZWlyYW1rb2FrcHFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDA5NDYsImV4cCI6MjA4OTExNjk0Nn0.6v4bbdFlvzs8H6jvGSGlYuJRn3PKejxGD_6B0_4ODFY';
const _SB_HEADERS = {
  'apikey': _SB_KEY,
  'Authorization': 'Bearer ' + _SB_KEY,
  'Content-Type': 'application/json',
};

/* 토스 SDK에서 유저 정보 획득 (앱인토스 브릿지) */
function _getTossUser() {
  try {
    // 앱인토스가 window.tossUserInfo 또는 URL 파라미터로 전달
    if (window.tossUserInfo) return window.tossUserInfo;
    const p = new URLSearchParams(location.search);
    if (p.get('user_id')) {
      return { id: p.get('user_id'), gender: p.get('gender'), birth_date: p.get('birth_date') };
    }
  } catch(e) {}
  return null;
}

/* 유저 저장 (중복 무시) */
async function sbInitUser() {
  const u = _getTossUser();
  if (!u) return null;
  await fetch(`${_SB_URL}/rest/v1/users`, {
    method: 'POST',
    headers: { ..._SB_HEADERS, 'Prefer': 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ toss_user_id: u.id, gender: u.gender, birth_date: u.birth_date })
  }).catch(() => {});
  return u;
}

/* 이벤트 로그 저장 */
async function sbLog(appName, eventType, eventData) {
  const u = _getTossUser();
  if (!u) return;
  fetch(`${_SB_URL}/rest/v1/event_logs`, {
    method: 'POST',
    headers: { ..._SB_HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ toss_user_id: u.id, app_name: appName, event_type: eventType, event_data: eventData ?? {} })
  }).catch(() => {});
}

/* 랭킹 저장 - 축구 공막기 */
async function sbSaveSoccerRanking(nickname, savedCount, bestStreak) {
  const u = _getTossUser();
  if (!u) return;
  fetch(`${_SB_URL}/rest/v1/soccer_rankings`, {
    method: 'POST',
    headers: { ..._SB_HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ toss_user_id: u.id, nickname, saved_count: savedCount, best_streak: bestStreak })
  }).catch(() => {});
}

/* 랭킹 저장 - 똥피하기 */
async function sbSavePoopRanking(nickname, survivalTime) {
  const u = _getTossUser();
  if (!u) return;
  fetch(`${_SB_URL}/rest/v1/poop_rankings`, {
    method: 'POST',
    headers: { ..._SB_HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ toss_user_id: u.id, nickname, survival_time: survivalTime })
  }).catch(() => {});
}

/* 랭킹 조회 */
async function sbGetSoccerRankings(limit = 10) {
  const res = await fetch(`${_SB_URL}/rest/v1/soccer_rankings?select=nickname,saved_count,best_streak&order=saved_count.desc&limit=${limit}`, {
    headers: _SB_HEADERS
  }).catch(() => null);
  return res?.ok ? res.json() : [];
}

async function sbGetPoopRankings(limit = 10) {
  const res = await fetch(`${_SB_URL}/rest/v1/poop_rankings?select=nickname,survival_time&order=survival_time.desc&limit=${limit}`, {
    headers: _SB_HEADERS
  }).catch(() => null);
  return res?.ok ? res.json() : [];
}
