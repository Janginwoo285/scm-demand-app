/* 입력 보호 + 생산기획 재고·생산 가능 물량 누적(＋/−) 입력
   1) 입력 중 화면이 다시 그려져 칸이 비워지는 문제 방지
      - 15초 자동 갱신(poll), 창 포커스 갱신(syncWorkspace) 같은 '백그라운드' 다시 그리기는
        입력칸에 커서가 있거나 값을 고치는 중이면 건너뜁니다.
      - 사용자가 직접 누른 버튼(이벤트 안에서 호출)은 그대로 다시 그립니다.
   2) 생산 탭: 숫자를 입력하면 기존 값에 더하기(기본) / 빼기 중 선택해서 반영 + 차종 추가하기
   3) 판매계획 확정 화면: '공유 요약 복사'·'기대효과 보기' 대신 '최종 결과 저장하기' → 최종 결과 화면 */
(function(){
"use strict";
if(typeof SCREENS==="undefined"||typeof refresh!=="function") return;

/* ---------- 1. 입력 보호 ---------- */
let dirtyScreen=null;
const isField=el=>el&&el.matches&&el.matches("input,textarea,select");
document.addEventListener("input",e=>{ if(isField(e.target)&&curEl&&curEl.contains(e.target)) dirtyScreen=nav.cur(); },true);
document.addEventListener("click",e=>{ if(e.target.closest("[data-work-submit],[data-adj-submit],[data-cta],[data-tab],[data-go],.back")) dirtyScreen=null; },true);
const baseRefresh=window.refresh;
window.refresh=function(){
  const id=nav.cur();
  if(dirtyScreen&&dirtyScreen!==id) dirtyScreen=null;
  const ae=document.activeElement;
  const typing=isField(ae)&&curEl&&curEl.contains(ae)&&ae.type!=="button";
  if(!window.event&&(typing||dirtyScreen===id)) return; // 백그라운드 갱신은 입력 중이면 건너뜀
  return baseRefresh.apply(this,arguments);
};

/* ---------- 2. 생산 탭 누적 입력 ---------- */
if(!SCREENS.rolecapacity) return;
S.adjMode=S.adjMode||{inv:"add",cap:"add"};
const W=()=>S.workspace||{inventory:[],capacities:[]};
const models=()=>[...new Set([...Object.keys((S.dataset&&S.dataset.series)||{}),...((W().models)||[])])];
const n=v=>fmt(Number(v)||0);
const opt=()=>models().map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join("");
const inv=m=>(W().inventory||[]).find(x=>x.model===m);
const cap=(m,mo,l)=>(W().capacities||[]).find(x=>x.model===m&&x.month===mo&&x.line===l);
const toggle=k=>`<div class="adj-toggle" data-adj-group="${k}">
  <button type="button" class="${S.adjMode[k]==="add"?"on":""}" data-adj-mode="${k}|add">＋ 더하기</button>
  <button type="button" class="${S.adjMode[k]==="sub"?"on":""}" data-adj-mode="${k}|sub">− 빼기</button></div>`;
const num=(id,label)=>`<label>${label}<input class="field" id="${id}" type="number" min="0" max="999999" inputmode="numeric" placeholder="0"></label>`;

function invHint(){
  const m=document.getElementById("adj-inv-model")?.value; const x=inv(m);
  const el=document.getElementById("adj-inv-now");
  if(el) el.innerHTML=`현재 <b>${esc(m||"")}</b> · 완성차 <b>${x?n(x.finished):0}대</b> · 부품 <b>${x?n(x.parts):0}대</b>`;
}
function capHint(){
  const g=id=>(document.getElementById(id)?.value||"").trim();
  const x=cap(g("adj-cap-model"),g("adj-cap-month"),g("adj-cap-line"));
  const el=document.getElementById("adj-cap-now");
  if(el) el.innerHTML=g("adj-cap-line")?`현재 · 라인 생산능력 <b>${x?n(x.capacity):0}대</b> · 부품 수급 최대 <b>${x?n(x.partsLimit):0}대</b>`:"라인을 입력하면 현재 등록된 값이 보여요";
}

SCREENS.rolecapacity.html=()=>{
  const ms=models();
  const rows=ms.map(m=>{const x=inv(m);const cs=(W().capacities||[]).filter(c=>c.model===m&&c.month===planMonth());
    const c=cs.length?cs.reduce((s,a)=>s+Math.min(a.capacity,a.partsLimit),0):null;
    return `<div class="row"><div class="grow"><div class="t">${esc(m)}</div><div class="s">완성차 ${x?n(x.finished):"미입력"} · 부품 ${x?n(x.parts):"미입력"}</div></div><b>${c==null?"능력 미입력":n(c)+"대"}</b></div>`;}).join("");
  return `<div class="eyebrow">생산기획팀 · 제약 입력</div><h1>만들 수 있는 수량을<br>먼저 공유해요</h1>
  <p class="lead">숫자를 넣으면 기존 값에 <b>더해져요</b>. 잘못 넣었으면 <b>− 빼기</b>로 바꿔서 같은 수를 입력하세요.</p>
  <div class="sec" style="display:flex;justify-content:space-between;align-items:center">차종별 현재 입력<button type="button" class="adj-add" data-adj-addmodel>＋ 차종 추가하기</button></div>${rows}
  <div class="sec">재고 현황 입력</div>
  <div class="work-form">
    ${toggle("inv")}
    <label>차종<select class="field" id="adj-inv-model">${opt()}</select></label>
    <div class="adj-now" id="adj-inv-now"></div>
    ${num("adj-finished","완성차 재고 (대)")}${num("adj-parts","부품 가용 수량 (대 환산)")}
    <button class="btn" data-adj-submit="inv">재고 반영</button>
  </div>
  <div class="sec">생산 가능 물량 입력</div>
  <div class="work-form">
    ${toggle("cap")}
    <label>차종<select class="field" id="adj-cap-model">${opt()}</select></label>
    <label>생산 대상 월<input class="field" id="adj-cap-month" value="${esc(planMonth())}" placeholder="YYYY-MM"></label>
    <label>라인<input class="field" id="adj-cap-line" placeholder="예: 광주 1라인"></label>
    <div class="adj-now" id="adj-cap-now"></div>
    ${num("adj-capacity","라인 생산능력 (대)")}${num("adj-partsLimit","부품 수급상 최대 수량 (대)")}
    <label>제약·특이 사항<textarea class="field" id="adj-cap-note" maxlength="220" placeholder="부품 수급 차질, 정비 일정, 대체 사양"></textarea></label>
    <button class="btn" data-adj-submit="cap">생산 가능 물량 반영</button>
  </div>
  <p class="small" style="margin:15px 0">시범용 화면입니다. 실제 현대차 ERP·실제 부품/완성차 재고와 연결되어 있지 않습니다.</p>`;
};
const baseMount=SCREENS.rolecapacity.mount;
SCREENS.rolecapacity.mount=el=>{ if(baseMount) baseMount(el); invHint(); capHint(); };
// 화면이 처음 열릴 때도 현재값 표시
new MutationObserver(()=>{ if(nav.cur()==="rolecapacity"){ if(document.getElementById("adj-inv-now")?.innerHTML==="") invHint(); if(document.getElementById("adj-cap-now")?.innerHTML==="") capHint(); } })
  .observe(document.body,{childList:true,subtree:true});
document.addEventListener("change",e=>{ if(e.target.id==="adj-inv-model") invHint(); if(["adj-cap-model"].includes(e.target.id)) capHint(); });
document.addEventListener("input",e=>{ if(["adj-cap-month","adj-cap-line"].includes(e.target.id)) capHint(); });

document.addEventListener("click",async e=>{
  const t=e.target.closest("[data-adj-mode]");
  if(t){ const [k,m]=t.dataset.adjMode.split("|"); S.adjMode[k]=m;
    t.parentElement.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b===t)); return; }
  const b=e.target.closest("[data-adj-submit]"); if(!b) return;
  const kind=b.dataset.adjSubmit, mode=S.adjMode[kind];
  const g=id=>(document.getElementById(id)?.value||"").trim(), q=id=>Number(g(id)||0);
  let action,data;
  if(kind==="inv"){ action="inventory.save"; data={model:g("adj-inv-model"),finished:q("adj-finished"),parts:q("adj-parts"),mode}; if(!data.finished&&!data.parts) return toast("수량을 입력해 주세요"); }
  else { action="capacity.save"; data={model:g("adj-cap-model"),month:g("adj-cap-month"),line:g("adj-cap-line"),capacity:q("adj-capacity"),partsLimit:q("adj-partsLimit"),note:g("adj-cap-note"),mode};
    if(!data.line) return toast("라인을 입력해 주세요"); if(!data.capacity&&!data.partsLimit) return toast("수량을 입력해 주세요"); }
  if(!S.online) return toast("서버에 연결되지 않아 저장할 수 없어요");
  b.disabled=true;
  try{
    // 최신 값을 다시 읽은 뒤, 기존 값 ± 입력값으로 계산해서 저장 (서버에는 결과값만 보냄)
    if(typeof window.refreshWorkspace==="function"){ S.workBusy=false; await window.refreshWorkspace(true); }
    const sign=mode==="sub"?-1:1;
    if(kind==="inv"){ const x=inv(data.model)||{};
      data={model:data.model,finished:(+x.finished||0)+sign*data.finished,parts:(+x.parts||0)+sign*data.parts}; }
    else { const x=cap(data.model,data.month,data.line)||{};
      data={...data,capacity:(+x.capacity||0)+sign*data.capacity,partsLimit:(+x.partsLimit||0)+sign*data.partsLimit,note:data.note||x.note||""}; delete data.mode; }
    if(Object.values(data).some(v=>typeof v==="number"&&v<0)) throw new Error("현재 값보다 많이 뺄 수 없어요");
    await api("workspace",{method:"POST",body:{action,data}});
    dirtyScreen=null;
    if(typeof window.refreshWorkspace==="function") await window.refreshWorkspace(true);
    baseRefresh();
    toast(mode==="sub"?"입력한 수량만큼 뺐어요":"기존 값에 더했어요");
  }catch(err){ toast(err.message||"저장하지 못했어요"); }
  finally{ b.disabled=false; }
});


/* ---------- 차종 추가하기 ---------- */
document.addEventListener("click",e=>{
  if(!e.target.closest("[data-adj-addmodel]")) return;
  openSheet(`<h2 style="margin:0 0 6px">차종 추가하기</h2><p class="small" style="margin:0 0 12px">추가한 차종은 재고·생산 가능 물량·주문 입력에서 바로 고를 수 있어요.</p>
    <input class="field" id="adjModelName" maxlength="30" placeholder="예: SUV G, 전기차 H">
    <button class="btn" style="width:100%;margin-top:12px" id="adjModelOk">추가하기</button>`);
  setTimeout(()=>document.getElementById("adjModelName")?.focus(),50);
  document.getElementById("adjModelOk").onclick=async()=>{
    const name=(document.getElementById("adjModelName")?.value||"").trim();
    if(!name) return toast("차종 이름을 입력해 주세요");
    if(models().includes(name)) return toast("이미 있는 차종이에요");
    if(!S.online) return toast("서버에 연결되지 않아 저장할 수 없어요");
    try{
      await api("workspace",{method:"POST",body:{action:"model.add",data:{name}}});
      S.workBusy=false; if(typeof window.refreshWorkspace==="function") await window.refreshWorkspace(true);
      closeSheet(); dirtyScreen=null; baseRefresh(); toast(name+" 차종을 추가했어요");
    }catch(err){ toast(err.message||"추가하지 못했어요"); }
  };
});

/* ---------- 3. 판매계획 확정 → 최종 결과 ---------- */
if(SCREENS.confirm){
  const confirmHtml=SCREENS.confirm.html;
  SCREENS.confirm.html=()=>confirmHtml().replace(/<button[^>]*data-copy[^>]*>[\s\S]*?<\/button>/,"");
  SCREENS.confirm.cta=()=>({label:"최종 결과 저장하기",go:async()=>{
    for(let i=0;i<30&&S.planStatus==="saving";i++) await new Promise(r=>setTimeout(r,200));
    if(S.online&&S.planStatus!=="saved"){ try{ await savePlan(analyzeAll()); }catch(e){} }
    if(S.online&&S.planStatus!=="saved") return toast("저장하지 못했어요. 다시 눌러 주세요");
    nav.push("planfinal");
  }});
  SCREENS.planfinal={ title:"최종 결과", noBack:true, html:()=>{
    const p=S.lastPlan; if(!p) return `<div class="card small">저장된 판매계획이 없어요.</div>`;
    const who=(S.accounts||[]).find(a=>a.id===p.confirmedBy)?.name||S.account?.name||"";
    return `<div style="text-align:center"><div class="donecheck">${ICON.check}</div>
      <div class="eyebrow">최종 결과 · ${esc(p.month||"")}</div>
      <h1>${planMonthKo()} 판매계획<br>최종 결과를 저장했어요</h1>
      <p class="lead">${S.online?"팀 서버에 저장됐어요":"체험 모드라 서버에는 저장되지 않았어요"}${p.confirmedAt?" · "+when(p.confirmedAt):""}${who?" · "+esc(who):""}</p></div>
      <div class="stats"><div class="stat"><div class="v" style="font-size:20px;padding-top:6px">${fmt(p.total)}</div><div class="l">총 판매계획(대)</div><div class="d">생산기획 전달 기준</div></div>
        <div class="stat"><div class="v">${p.auto}</div><div class="l">자동 확정</div><div class="d">기준 ±${p.limit??S.limit}% 안</div></div>
        <div class="stat"><div class="v" style="color:var(--warn)">${p.exceptions}</div><div class="l">협의 확정</div><div class="d">예외 협의 반영</div></div></div>
      <div class="sec">차종별 최종 수량</div>
      <div class="card">${(p.items||[]).map(i=>`<div class="row"><div class="grow"><div class="t">${esc(i.model)}</div><div class="s">${esc(i.status||"")}${i.memo?` · ${esc(i.memo)}`:""}</div></div><b class="num">${fmt(i.qty)}대</b></div>`).join("")}</div>
      <div class="sec">다음 할 일</div>
      <button class="tapcard" data-go="roletransfers"><div class="ic">→</div><div style="flex:1"><b>생산기획팀에 전달하기</b><div class="small">확정 계획을 생산기획 화면으로 보내요</div></div><span class="chev">›</span></button>
      <button class="tapcard" data-go="records"><div class="ic g">✓</div><div style="flex:1"><b>팀 기록에서 보기</b><div class="small">확정한 계획 이력을 확인해요</div></div><span class="chev">›</span></button>`;
  }, cta:()=>({label:"홈으로",go:()=>nav.reset("home")}) };
}

/* ---------- 4. 현황 탭 · 기존 주문·판매실적 검증 (예측 탭으로 넘어가지 않음) ---------- */
if(SCREENS.roleoverview){
  const ovHtml=SCREENS.roleoverview.html;
  SCREENS.roleoverview.html=()=>ovHtml().replace('data-go="merge"><div class="grow"><b>기존 주문·판매실적 검증','data-go="roleverify"><div class="grow"><b>기존 주문·판매실적 검증');
  const baseTab=window.roleTabActive;
  if(typeof baseTab==="function") window.roleTabActive=id=>id==="roleverify"?"roleoverview":baseTab(id);
  SCREENS.roleverify={ title:"주문·실적 검증", enter:()=>{ if(typeof window.refreshWorkspace==="function") void window.refreshWorkspace(); }, html:()=>{
    const ds=S.dataset||{series:{},orders:[]}, orders=ds.orders||[], series=ds.series||{};
    const is=issues(); const dupSet=new Set(is.dups), misSet=new Set(is.missing);
    const sales=(W().orders||[]);
    const pill=(t,k)=>`<span class="pill ${k}">${t}</span>`;
    const row=(t,s,r)=>`<div class="row"><div class="grow"><div class="t">${t}</div><div class="s">${s}</div></div>${r||""}</div>`;
    const okBox=t=>`<div class="card small" style="color:#1B8E5A">✓ ${t}</div>`;
    const flagged=orders.map((o,i)=>({o,i})).filter(x=>dupSet.has(x.i)||misSet.has(x.i));
    const salesDup=(()=>{const seen=new Map(),out=[];sales.forEach(x=>{const k=[x.dealer,x.model,x.targetMonth||"",x.quantity].join("|");if(seen.has(k))out.push(x);else seen.set(k,1);});return out;})();
    const totalSales=Object.values(series).reduce((s,a)=>s+a.reduce((t,v)=>t+(Number(v)||0),0),0);
    return `<div class="eyebrow">SCM · 데이터 검증</div><h1>기존 주문·판매실적을<br>한 번에 확인해요</h1>
    <p class="lead">딜러 주문의 중복·차종 누락과 월별 판매실적의 빈 값을 점검해요. 이 화면은 확인용이며 예측 탭으로 넘어가지 않아요.</p>
    <div class="stats"><div class="stat"><div class="v">${fmt(orders.length)}</div><div class="l">기존 딜러 주문</div><div class="d">건</div></div>
      <div class="stat"><div class="v" style="color:${is.dups.length?"var(--warn)":"inherit"}">${is.dups.length}</div><div class="l">중복 주문</div><div class="d">같은 주문번호</div></div>
      <div class="stat"><div class="v" style="color:${is.missing.length?"var(--warn)":"inherit"}">${is.missing.length}</div><div class="l">차종 누락</div><div class="d">주문 정보</div></div></div>
    <div class="stats"><div class="stat"><div class="v">${Object.keys(series).length}</div><div class="l">판매실적 차종</div><div class="d">종</div></div>
      <div class="stat"><div class="v">${fmt(totalSales)}</div><div class="l">누적 판매실적</div><div class="d">대</div></div>
      <div class="stat"><div class="v" style="color:${is.gaps.length?"var(--warn)":"inherit"}">${is.gaps.length}</div><div class="l">실적 빈 값</div><div class="d">월</div></div></div>
    <div class="sec">기존 주문 점검 결과</div>
    ${flagged.length?`<div class="card">${flagged.map(({o,i})=>row(`${esc(o.no)} · ${esc(o.dealer)}`,`${o.model?esc(o.model):"차종 없음"} · ${fmt(o.qty)}대`,dupSet.has(i)?pill("중복","warn"):pill("차종 누락","warn"))).join("")}</div>`:okBox("중복·누락된 주문이 없어요")}
    <div class="sec">기존 딜러 주문 전체 (${orders.length}건)</div>
    <div class="card">${orders.map((o,i)=>row(`${esc(o.no)} · ${esc(o.dealer)}`,`${o.model?esc(o.model):"차종 없음"}`,`<b class="num">${fmt(o.qty)}대</b>`)).join("")||'<div class="small">주문 데이터가 없어요</div>'}</div>
    <div class="sec">판매실적 빈 값</div>
    ${is.gaps.length?`<div class="card">${is.gaps.map(g=>row(esc(g.model),`${mLabel(g.i)} 실적 없음`,pill("빈 값","warn"))).join("")}</div>`:okBox("빈 값이 없어요")}
    <div class="sec">차종별 판매실적 요약</div>
    <div class="card">${Object.entries(series).map(([k,a])=>{const vals=a.filter(v=>v!=null&&v!=="");const avg=vals.length?vals.reduce((s,v)=>s+ +v,0)/vals.length:0;const last=a[a.length-1];
      return row(esc(k),`${mLabel(0)}~${mLabel(a.length-1)} · ${vals.length}/${a.length}개월 · 월평균 ${fmt(avg)}대`,`<b class="num">${last==null?"–":fmt(last)+"대"}</b>`);}).join("")}</div>
    <div class="sec">영업팀 신규 주문 (${sales.length}건)</div>
    ${sales.length?`<div class="card">${sales.slice(0,15).map(x=>row(`${esc(x.dealer)} · ${esc(x.model)}`,`${esc(x.targetMonth||"월 미지정")} · ${fmt(x.quantity)}대`,salesDup.includes(x)?pill("중복 의심","warn"):pill(esc(x.status||"접수"),"ok"))).join("")}</div>`:`<div class="card small">아직 영업팀이 입력한 주문이 없어요</div>`}
    <p class="small" style="margin:15px 0">최근 월은 맨 오른쪽 숫자예요. 빈 값 보정과 예측 재계산은 예측 탭에서 할 수 있어요.</p>`;
  }};
}

/* ---------- 5. SCM 관리: 팀원 비밀번호 초기화·계정 삭제·연습 데이터 초기화 ---------- */
const isSCM=()=>S.role==="SCM 수요계획팀"&&S.online&&!S.demo;
if(SCREENS.settings){
  const setHtml=SCREENS.settings.html;
  SCREENS.settings.html=()=>{
    const h=setHtml(); if(!isSCM()) return h;
    const others=(S.accounts||[]).filter(a=>a.id!==S.account?.id);
    return h+`<div class="sec">팀원 계정 관리 · SCM 전용</div>
      <div class="card">${others.length?others.map(a=>`<div class="row"><div class="grow"><div class="t">${esc(a.name)}</div><div class="s">${esc(a.role||"직무 미정")} · ${a.hasPin?"비밀번호 설정됨":"비밀번호 미설정"}</div></div>
        <button type="button" class="adj-mini" data-adm="resetPin|${esc(a.id)}|${esc(a.name)}">비번 초기화</button>
        <button type="button" class="adj-mini danger" data-adm="deleteAccount|${esc(a.id)}|${esc(a.name)}">삭제</button></div>`).join(""):'<div class="small">다른 팀원 계정이 없어요</div>'}</div>
      <p class="small" style="margin:6px 0 0">비밀번호를 초기화하면 그 팀원은 「새 계정 만들기」에서 같은 이름을 넣고 직무·비밀번호를 다시 정해요.</p>
      <div class="sec">연습 데이터</div>
      <button type="button" class="btn" style="width:100%;background:#F04452" data-adm="resetPractice||">연습 데이터 초기화</button>
      <p class="small" style="margin:6px 0 18px">판매계획·업무(주문·재고·생산·협의)·판매데이터·로그를 처음 상태로 되돌려요. 계정은 그대로 남아요.</p>`;
  };
}
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-adm]"); if(!t) return;
  const [op,id,name]=t.dataset.adm.split("|");
  const msg=op==="resetPin"?`${name}님의 비밀번호를 초기화할까요?<br><span class="small">접속 중이면 로그아웃돼요.</span>`
    :op==="deleteAccount"?`${name}님의 계정을 삭제할까요?<br><span class="small">되돌릴 수 없어요.</span>`
    :`연습 데이터를 모두 초기화할까요?<br><span class="small">판매계획·업무·판매데이터·로그가 지워지고 되돌릴 수 없어요.</span>`;
  openSheet(`<h2 style="margin:0 0 10px">${msg}</h2><div style="display:flex;gap:8px;margin-top:14px"><button class="btn sub" style="flex:1" id="admNo">취소</button><button class="btn" style="flex:1;background:#F04452" id="admOk">확인</button></div>`);
  document.getElementById("admNo").onclick=()=>closeSheet();
  document.getElementById("admOk").onclick=async()=>{
    try{
      await api("accounts",{method:"PUT",body:{op,accountId:id||undefined}});
      closeSheet();
      toast(op==="resetPin"?"비밀번호를 초기화했어요":op==="deleteAccount"?"계정을 삭제했어요":"연습 데이터를 초기화했어요");
      if(op==="resetPractice"){ S.plans=[]; S.lastPlan=null; S.workspace=null; S.workAt=0; S.auditLogs=[]; }
      if(typeof poll==="function") await poll();
      if(typeof loadAudit==="function") void loadAudit();
      if(typeof window.refreshWorkspace==="function"){ S.workBusy=false; void window.refreshWorkspace(true); }
      baseRefresh();
    }catch(err){ toast(err.message||"처리하지 못했어요"); }
  };
});

/* ---------- 6. 발표용 둘러보기 (저장 안 됨) ---------- */
if(SCREENS.login&&typeof startDemo==="function"){
  const loginHtml=SCREENS.login.html;
  SCREENS.login.html=()=>loginHtml().replace(/<\/div>\s*$/,`<button type="button" class="adj-demo" data-adj-demo>발표용 둘러보기 · 계정 없이 세 직무 화면 보기 (저장 안 됨)</button></div>`);
  document.addEventListener("click",e=>{ if(e.target.closest("[data-adj-demo]")) startDemo(); });
}

/* ---------- 7. 새 차종 판매실적 입력 (SCM) ---------- */
SCREENS.rolemodelsales={ title:"새 차종 판매실적", html:()=>{
  const series=(S.dataset&&S.dataset.series)||{}, N=Object.values(series)[0]?.length||24;
  const pending=((W().models)||[]).filter(m=>!series[m]);
  if(!pending.length) return `<div class="eyebrow">SCM · 판매실적</div><h1>판매실적이 필요한<br>새 차종이 없어요</h1><p class="lead">생산 탭에서 차종을 추가하면 여기서 월별 판매실적을 넣을 수 있어요.</p>`;
  return `<div class="eyebrow">SCM · 판매실적</div><h1>새 차종의 월별 실적을<br>넣으면 예측에 들어가요</h1>
    <p class="lead">${mLabel(0)}부터 ${mLabel(N-1)}까지 ${N}개월 판매대수를 쉼표나 줄바꿈으로 나눠 입력하세요. 빈 달은 0으로 넣어 주세요.</p>
    <div class="work-form">
      <label>차종<select class="field" id="adj-ms-model">${pending.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join("")}</select></label>
      <label>월별 판매대수 (${N}개)<textarea class="field" id="adj-ms-values" rows="5" placeholder="예: 120, 135, 150, ..."></textarea></label>
      <div class="adj-now" id="adj-ms-count">0 / ${N}개 입력</div>
      <button class="btn" data-adj-ms>판매실적 저장</button>
    </div>`;
}};
document.addEventListener("input",e=>{ if(e.target.id!=="adj-ms-values") return;
  const N=Object.values(S.dataset.series)[0]?.length||24, n=e.target.value.split(/[\s,]+/).filter(Boolean).length;
  const el=document.getElementById("adj-ms-count"); if(el) el.textContent=`${n} / ${N}개 입력`; });
document.addEventListener("click",async e=>{
  if(!e.target.closest("[data-adj-ms]")) return;
  const model=document.getElementById("adj-ms-model")?.value, N=Object.values(S.dataset.series)[0]?.length||24;
  const vals=(document.getElementById("adj-ms-values")?.value||"").split(/[\s,]+/).filter(Boolean).map(Number);
  if(!model) return toast("차종을 골라 주세요");
  if(vals.length!==N||vals.some(v=>!Number.isFinite(v)||v<0)) return toast(`0 이상의 숫자 ${N}개를 입력해 주세요 (지금 ${vals.length}개)`);
  try{
    const series={...S.dataset.series,[model]:vals.map(v=>Math.round(v))};
    await api("dataset",{method:"PUT",body:{start:S.dataset.start,series,orders:S.dataset.orders,note:`${model} 판매실적 ${N}개월 입력`}});
    S.dataset.series=series; dirtyScreen=null; toast(model+" 판매실적을 저장했어요");
    if(typeof poll==="function") void poll();
    nav.replace("roleverify");
  }catch(err){ toast(err.message||"저장하지 못했어요"); }
});
if(SCREENS.roleverify){
  const vHtml=SCREENS.roleverify.html;
  SCREENS.roleverify.html=()=>{ const h=vHtml(); const series=(S.dataset&&S.dataset.series)||{};
    const pending=((W().models)||[]).filter(m=>!series[m]);
    const tileH=`<div class="sec">새 차종 판매실적</div><button class="tapcard" data-go="rolemodelsales"><div class="grow"><b>새 차종 판매실적 입력 ›</b><div class="small">${pending.length?`실적이 없는 차종 ${pending.length}개: ${pending.map(esc).join(", ")}`:"실적이 필요한 새 차종이 없어요"}</div></div><span class="chev">›</span></button>`;
    return h.replace('<p class="small" style="margin:15px 0">최근 월은', tileH+'<p class="small" style="margin:15px 0">최근 월은'); };
  const prevTab=window.roleTabActive;
  window.roleTabActive=id=>id==="rolemodelsales"?"roleoverview":prevTab(id);
}
const css=document.createElement("style");
css.textContent=`.adj-toggle{display:flex;gap:6px;background:#F2F4F6;border-radius:12px;padding:4px;margin-bottom:10px}
.adj-toggle button{flex:1;border:0;background:transparent;border-radius:9px;padding:10px 0;font-weight:700;color:#6B7684;font-size:15px}
.adj-toggle button.on{background:#fff;color:#3182F6;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.adj-toggle button[data-adj-mode$="sub"].on{color:#F04452}
.adj-add{border:0;background:#E8F3FF;color:#3182F6;font-weight:700;font-size:13px;border-radius:8px;padding:6px 10px}
.adj-mini{border:0;background:#F2F4F6;color:#4E5968;font-weight:700;font-size:12px;border-radius:8px;padding:6px 8px;margin-left:6px;white-space:nowrap}
.adj-mini.danger{background:#FFEEEE;color:#F04452}
.adj-demo{display:block;width:100%;margin-top:28px;border:0;background:transparent;color:#8B95A1;font-size:13px;text-decoration:underline}
.adj-now{font-size:13px;color:#4E5968;background:#F9FAFB;border-radius:10px;padding:9px 12px;margin:2px 0 8px}`;
document.head.appendChild(css);
})();
