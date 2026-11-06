// 새 계정 만들기 (이름 + 소속 + 비밀번호) 후 바로 로그인
import crypto from "node:crypto";
import { update } from "./_lib/store.js";
import { P, fresh, json, fail, body, hashPin, validPin, startSession, setSid, publicAccount, ROLES, log, withErrors, currentAccount } from "./_lib/core.js";
import { TEAM } from "./_lib/seed.js";
export async function POST(req) {
  return withErrors(async () => {
    const { name, role, pin } = await body(req);
    const nm = String(name || "").trim().replace(/[<>]/g, "");
    if (!nm || nm.length > 20) return fail("이름을 1~20자로 입력해 주세요");
    if (!ROLES.includes(role)) return fail("소속을 골라 주세요");
    if (!validPin(pin)) return fail("비밀번호는 숫자 4자리예요");
    const acc = await update(P.accounts, fresh.accounts, d => {
      if (d.list.some(a => a.name === nm)) return null;
      if (d.list.length >= 100) return null;
      const salt = crypto.randomBytes(16).toString("hex");
      const a = { id: "acc-" + crypto.randomBytes(6).toString("hex"), name: nm, role, team: TEAM, salt, hash: hashPin(pin, salt), loginCount: 0, online: false, createdAt: new Date().toISOString() };
      d.list.push(a); return { ...a };
    });
    if (!acc) return fail("같은 이름의 계정이 이미 있어요", 409);
    await log("account", `${acc.name} 계정 생성 (${role})`, acc.id);
    const { token, ses, acc: a } = await startSession(acc, req);
    return json({ me: { ...publicAccount(a), sessionId: ses.id, sessionStart: ses.loginAt } }, 200, setSid(token));
  });
}

// SCM 관리 기능: 팀원 비밀번호 초기화·계정 삭제·연습 데이터 초기화
export async function PUT(req) {
  return withErrors(async () => {
    const { acc } = await currentAccount(req);
    if (!acc) return fail("로그인이 필요해요", 401);
    if (acc.role !== ROLES[0]) return fail("SCM 수요계획팀만 관리할 수 있어요", 403);
    const { op, accountId } = await body(req);
    const at = new Date().toISOString();
    if (op === "resetPin" || op === "deleteAccount") {
      if (!accountId) return fail("계정을 선택해 주세요");
      if (accountId === acc.id) return fail("본인 계정은 설정의 비밀번호 변경을 이용해 주세요");
      let target = null;
      await update(P.accounts, fresh.accounts, d => {
        const i = d.list.findIndex(x => x.id === accountId);
        if (i < 0) return;
        target = { ...d.list[i] };
        if (op === "deleteAccount") d.list.splice(i, 1);
        else Object.assign(d.list[i], { salt: null, hash: null, fails: 0, lockUntil: null, online: false, currentSession: null });
      });
      if (!target) return fail("계정을 찾을 수 없어요", 404);
      await update(P.sessions, fresh.sessions, d => {
        d.list.forEach(s => { if (s.accountId === accountId && !s.logoutAt) { s.logoutAt = at; s.durationMin = 0; s.endedBy = acc.id; } });
      });
      await log("admin", op === "deleteAccount" ? `${target.name} 계정 삭제 (관리: ${acc.name})` : `${target.name} 비밀번호 초기화 (관리: ${acc.name})`, acc.id, { op, target: accountId });
      return json({ ok: true });
    }
    if (op === "resetPractice") {
      const blankWs = { version: 1, rules: { threshold: 8, at: null, by: null }, orders: [], inventory: [], capacities: [], overrides: [], exceptions: [], transfers: [], models: [] };
      const replace = (d, v) => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, v); };
      await Promise.all([
        update(P.plans, fresh.plans, d => { d.list = []; }),
        update(P.workspace, () => ({ ...blankWs }), d => replace(d, JSON.parse(JSON.stringify(blankWs)))),
        update(P.dataset, fresh.dataset, d => replace(d, fresh.dataset())),
        update(P.activity, fresh.activity, d => { d.list = []; }),
        update(P.audit, fresh.audit, d => { d.list = []; })
      ]);
      await log("admin", `연습 데이터 초기화 (판매계획·업무·판매데이터·로그) — ${acc.name}`, acc.id, { op });
      return json({ ok: true, at });
    }
    return fail("지원하지 않는 작업이에요");
  });
}
