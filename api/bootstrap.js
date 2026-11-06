// 앱을 열 때 한 번에 필요한 데이터: 내 로그인 상태, 팀원 계정, 판매 데이터, 계획, 활동 기록
import { read, STORE_KIND } from "./_lib/store.js";
import { retireLegacyLogs } from "./_lib/log-migration.js";
import { P, fresh, json, publicAccount, currentAccount, withErrors } from "./_lib/core.js";
export async function GET(req) {
  return withErrors(async () => {
    // 일회성 이전 로그 영구 삭제; 실패해도 앱 로그인은 계속됩니다.
    const legacyLogsDeleted = await retireLegacyLogs().catch(e => { console.error("Legacy log cleanup:", e); return false; });
    const [{ acc, ses }, a, d, p, act] = await Promise.all([
      currentAccount(req), read(P.accounts, fresh.accounts), read(P.dataset, fresh.dataset), read(P.plans, fresh.plans), read(P.activity, fresh.activity)]);
    return json({
      me: acc ? { ...publicAccount(acc), sessionId: ses.id, sessionStart: ses.loginAt } : null,
      // 미인증 사용자는 로그인 계정 선택에 필요한 최소 필드만 볼 수 있어요.
      accounts: acc ? a.data.list.map(publicAccount) : a.data.list.map(x => ({
        id: x.id, name: x.name, role: x.role || null, hasPin: !!x.hash
      })),
      dataset: acc ? d.data : null,
      plans: acc ? p.data.list.slice(0, 12) : [],
      activity: acc ? act.data.list.slice(0, 40) : [],
      server: { store: STORE_KIND, time: new Date().toISOString(), legacyLogsDeleted }
    });
  });
}
