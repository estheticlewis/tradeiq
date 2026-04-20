import { useState, useEffect, useMemo, useCallback, createContext, useContext } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);
  const fetchProfile = async (id) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", id).single();
    setProfile(data); setLoading(false);
  };
  const signIn = (e, p) => supabase.auth.signInWithPassword({ email: e, password: p });
  const signUp = (e, p, n) => supabase.auth.signUp({ email: e, password: p, options: { data: { full_name: n } } });
  const signOut = () => supabase.auth.signOut();
  const isPro = profile?.plan === "pro" || profile?.plan === "prop";
  return <AuthContext.Provider value={{ user, profile, loading, isPro, signIn, signUp, signOut }}>{children}</AuthContext.Provider>;
}
const useAuth = () => useContext(AuthContext);

const PAIRS = ["XAUUSD","GBPUSD","NAS100","EURUSD","USDJPY","BTCUSD","USDCHF"];
const SESSIONS = ["London","New York","Asia","LN/NY Overlap"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOWS = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const ERRS = {
  htf_conflict:  { icon:"⚡", label:"HTF Conflict",   desc:"Traded against higher timeframe bias",           fix:"Confirm HTF direction before entry." },
  wrong_session: { icon:"🕐", label:"Wrong Session",  desc:"Entered outside valid trading window",           fix:"London / NY opens only." },
  early_exit:    { icon:"✂️", label:"Early Exit",     desc:"Closed before TP — left R on the table",        fix:"Set TP before entry. Walk away." },
  fomo:          { icon:"😰", label:"FOMO",           desc:"No defined POI at entry",                        fix:"Miss the entry, miss the trade." },
  no_poi:        { icon:"📍", label:"No POI",         desc:"No pre-marked OB, FVG or liquidity",            fix:"Pre-mark POIs before each session." },
  overtrading:   { icon:"🔄", label:"Overtrading",    desc:"Traded past daily loss limit",                   fix:"2 losses = done for the day." },
  no_confirm:    { icon:"⏳", label:"No Confirm",     desc:"No LTF displacement or MSS",                    fix:"Wait for MSS on entry timeframe." },
  news_entry:    { icon:"📰", label:"News Entry",     desc:"Traded during news window",                      fix:"30 min before/after red news = no trade." },
};

const f = (n, d=2) => typeof n==="number" ? n.toFixed(d) : "0";
const sgn = n => n > 0 ? "+" : "";
const calcStats = (trades) => {
  if (!trades.length) return { wr:0,wins:0,losses:0,bes:0,totalR:0,avgWin:0,avgLoss:0,pf:0,exp:0,total:0 };
  const wins=trades.filter(t=>t.result==="WIN"), losses=trades.filter(t=>t.result==="LOSS"), bes=trades.filter(t=>t.result==="BE");
  const dec=wins.length+losses.length, wr=dec?(wins.length/dec)*100:0;
  const totalR=trades.reduce((s,t)=>s+(t.r_multiple||0),0);
  const avgWin=wins.length?wins.reduce((s,t)=>s+(t.r_multiple||0),0)/wins.length:0;
  const avgLoss=losses.length?Math.abs(losses.reduce((s,t)=>s+(t.r_multiple||0),0)/losses.length):0;
  const gw=wins.reduce((s,t)=>s+(t.r_multiple||0),0), gl=Math.abs(losses.reduce((s,t)=>s+(t.r_multiple||0),0));
  const pf=gl?gw/gl:gw||0, exp=dec?(wr/100*avgWin)-((1-wr/100)*avgLoss):0;
  return {wr,wins:wins.length,losses:losses.length,bes:bes.length,totalR,avgWin,avgLoss,pf,exp,total:trades.length};
};
const getEquity = (trades) => { let c=0; return [...trades].sort((a,b)=>a.date.localeCompare(b.date)).map((t,i)=>{ c+=(t.r_multiple||0); return {n:i+1,r:+c.toFixed(2),date:t.date?.slice(5)||"",result:t.result}; }); };
const getMonthly = (trades) => { const m={}; trades.forEach(t=>{ const k=t.date?.slice(0,7)||""; if(!m[k])m[k]={month:k.slice(5),R:0,wins:0,losses:0,total:0}; m[k].R+=(t.r_multiple||0); m[k].total++; if(t.result==="WIN")m[k].wins++; if(t.result==="LOSS")m[k].losses++; }); return Object.entries(m).sort().map(([,v])=>({...v,R:+v.R.toFixed(2)})); };
const getSessions = (trades) => { const m={}; trades.forEach(t=>{ if(!m[t.session])m[t.session]={session:t.session,R:0,wins:0,total:0}; m[t.session].R+=(t.r_multiple||0); m[t.session].total++; if(t.result==="WIN")m[t.session].wins++; }); return Object.values(m).map(s=>({...s,R:+s.R.toFixed(2),wr:+((s.wins/s.total)*100).toFixed(1)})); };
const getErrors = (trades) => { const c={}; trades.forEach(t=>(t.errors||[]).forEach(e=>{ c[e]=(c[e]||0)+1; })); return Object.entries(c).sort((a,b)=>b[1]-a[1]); };
const groupDate = (trades) => { const m={}; trades.forEach(t=>{ if(!m[t.date])m[t.date]=[]; m[t.date].push(t); }); return m; };

const TTip = ({active,payload,label}) => { if(!active||!payload?.length)return null; return <div style={{background:"#1a1c22",border:"1px solid #2a2d38",borderRadius:6,padding:"8px 12px",fontFamily:"Inter,sans-serif",fontSize:11,color:"#9ca3af"}}><div style={{marginBottom:3}}>{label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color,fontWeight:600}}>{p.name}: {p.value}{typeof p.value==="number"&&Math.abs(p.value)<50?" R":""}</div>)}</div>; };

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d0f14;
  --bg1:#11131a;
  --bg2:#161820;
  --bg3:#1c1f28;
  --bg4:#22252f;
  --bg5:#282c38;
  --b1:#2a2d3a;
  --b2:#343848;
  --b3:#3f4455;
  --txt:#e8eaf0;
  --txt2:#9ca3af;
  --txt3:#6b7280;
  --txt4:#4b5263;
  --green:#22c55e;
  --green2:#16a34a;
  --green-dim:rgba(34,197,94,.08);
  --red:#ef4444;
  --red2:#dc2626;
  --red-dim:rgba(239,68,68,.08);
  --blue:#3b82f6;
  --blue-dim:rgba(59,130,246,.08);
  --amber:#f59e0b;
  --amber-dim:rgba(245,158,11,.08);
  --accent:#5b6af0;
  --accent-dim:rgba(91,106,240,.1);
}
html,body,#root{height:100%;background:var(--bg)}
body{font-family:'Inter',sans-serif;color:var(--txt);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

/* ── AUTH ── */
.auth-wrap{min-height:100vh;display:flex;background:var(--bg)}
.auth-left{flex:1;display:flex;align-items:center;justify-content:center;padding:40px}
.auth-right{width:420px;background:var(--bg1);border-left:1px solid var(--b1);display:flex;flex-direction:column;padding:48px 40px}
.auth-brand{font-size:22px;font-weight:700;color:var(--txt);letter-spacing:-.5px;margin-bottom:2px}
.auth-brand span{color:var(--accent)}
.auth-tagline{font-size:12px;color:var(--txt3);margin-bottom:40px}
.auth-heading{font-size:18px;font-weight:600;color:var(--txt);margin-bottom:6px}
.auth-sub{font-size:12px;color:var(--txt3);margin-bottom:28px}
.auth-tabs{display:flex;gap:0;border-bottom:1px solid var(--b1);margin-bottom:24px}
.atab{flex:1;padding:10px 0;border:none;background:none;font-family:'Inter',sans-serif;font-size:13px;color:var(--txt3);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .2s}
.atab:hover{color:var(--txt2)}
.atab.on{color:var(--txt);border-bottom-color:var(--accent);font-weight:500}
.auth-label{display:block;font-size:11px;font-weight:500;color:var(--txt3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px}
.auth-input{width:100%;background:var(--bg2);border:1px solid var(--b1);border-radius:7px;padding:10px 14px;color:var(--txt);font-family:'Inter',sans-serif;font-size:13px;outline:none;transition:border .2s;margin-bottom:14px}
.auth-input:focus{border-color:var(--accent)}
.auth-btn{width:100%;padding:11px;border-radius:7px;border:none;background:var(--accent);color:#fff;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s;margin-top:6px;display:flex;align-items:center;justify-content:center;gap:8px}
.auth-btn:hover{background:#4a5adf}
.auth-btn:disabled{opacity:.5;cursor:not-allowed}
.auth-err{background:var(--red-dim);border:1px solid rgba(239,68,68,.2);border-radius:6px;padding:9px 12px;font-size:12px;color:var(--red);margin-bottom:14px}
.auth-ok{background:var(--green-dim);border:1px solid rgba(34,197,94,.2);border-radius:6px;padding:9px 12px;font-size:12px;color:var(--green);margin-bottom:14px}
.auth-features{display:flex;flex-direction:column;gap:20px}
.auth-feat{display:flex;align-items:flex-start;gap:14px}
.auth-feat-icon{width:36px;height:36px;border-radius:8px;background:var(--accent-dim);border:1px solid rgba(91,106,240,.2);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.auth-feat-title{font-size:13px;font-weight:500;color:var(--txt);margin-bottom:2px}
.auth-feat-desc{font-size:11px;color:var(--txt3);line-height:1.5}

/* ── SHELL ── */
.shell{display:flex;height:100vh;overflow:hidden}

/* ── SIDEBAR ── */
.sb{width:52px;background:var(--bg1);border-right:1px solid var(--b1);display:flex;flex-direction:column;align-items:center;padding:12px 0;flex-shrink:0;transition:width .2s;overflow:hidden}
.sb.open{width:200px}
.sb-logo{width:32px;height:32px;background:var(--accent);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0;margin-bottom:24px;cursor:pointer}
.sb-logo-full{display:flex;align-items:center;gap:10px;width:100%;padding:0 14px;margin-bottom:24px;cursor:pointer}
.sb-logo-full .sb-logo{margin-bottom:0}
.sb-logo-text{font-size:15px;font-weight:700;color:var(--txt);letter-spacing:-.3px;white-space:nowrap}
.sb-logo-text span{color:var(--accent)}
.sb-nav{flex:1;display:flex;flex-direction:column;gap:2px;width:100%;padding:0 6px}
.sbn{display:flex;align-items:center;gap:10px;padding:9px;border-radius:7px;cursor:pointer;border:none;background:none;color:var(--txt3);transition:all .15s;width:100%;white-space:nowrap;overflow:hidden;position:relative}
.sbn:hover{background:var(--bg3);color:var(--txt2)}
.sbn.on{background:var(--accent-dim);color:var(--accent)}
.sbn-icon{font-size:16px;width:20px;text-align:center;flex-shrink:0}
.sbn-label{font-size:12px;font-weight:500;opacity:0;transition:opacity .15s}
.sb.open .sbn-label{opacity:1}
.sbn-badge{margin-left:auto;background:var(--red);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px;flex-shrink:0}
.sbn-badge.amber{background:var(--amber)}
.sb-bottom{padding:0 6px;width:100%;display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--b1);padding-top:10px;margin-top:10px}
.sb-user{display:flex;align-items:center;gap:8px;padding:7px;border-radius:7px;cursor:pointer;transition:all .15s;overflow:hidden}
.sb-user:hover{background:var(--bg3)}
.sb-avatar{width:24px;height:24px;border-radius:6px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0}
.sb-user-info{overflow:hidden}
.sb-user-email{font-size:10px;color:var(--txt3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px}
.sb-user-plan{font-size:10px;color:var(--accent);font-weight:600}

/* ── TOPBAR ── */
.topbar{height:48px;background:var(--bg1);border-bottom:1px solid var(--b1);display:flex;align-items:center;padding:0 20px;gap:16px;flex-shrink:0}
.topbar-title{font-size:14px;font-weight:600;color:var(--txt);flex:1}
.topbar-sub{font-size:11px;color:var(--txt3)}
.tb-btn{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:1px solid var(--b1);background:none;color:var(--txt2);font-family:'Inter',sans-serif;font-size:12px;cursor:pointer;transition:all .15s;white-space:nowrap}
.tb-btn:hover{border-color:var(--b3);color:var(--txt)}
.tb-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.tb-btn.primary:hover{background:#4a5adf}
.tb-sep{width:1px;height:20px;background:var(--b1)}

/* ── MAIN ── */
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
.page{flex:1;overflow-y:auto;padding:20px 24px}
.page-anim{animation:fadeIn .2s ease}

/* ── STAT ROWS ── */
.stat-row{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:var(--b1);border:1px solid var(--b1);border-radius:10px;overflow:hidden;margin-bottom:16px}
.stat-cell{background:var(--bg2);padding:14px 16px}
.stat-cell-label{font-size:10px;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;font-weight:500}
.stat-cell-val{font-size:20px;font-weight:700;letter-spacing:-.5px;line-height:1;font-family:'JetBrains Mono',monospace}
.stat-cell-meta{font-size:10px;color:var(--txt3);margin-top:4px}
.cv-green{color:var(--green)}.cv-red{color:var(--red)}.cv-amber{color:var(--amber)}.cv-blue{color:var(--blue)}.cv-txt{color:var(--txt)}

/* ── PANELS ── */
.panel{background:var(--bg2);border:1px solid var(--b1);border-radius:10px;overflow:hidden;margin-bottom:14px}
.panel-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--b1)}
.panel-title{font-size:12px;font-weight:600;color:var(--txt);display:flex;align-items:center;gap:8px}
.panel-title-dot{width:6px;height:6px;border-radius:50%;background:var(--accent)}
.panel-body{padding:16px}
.panel-body-np{padding:0}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.g13{display:grid;grid-template-columns:1fr 3fr;gap:14px}
.g31{display:grid;grid-template-columns:3fr 1fr;gap:14px}

/* ── TABLES ── */
.tbl-wrap{overflow-x:auto}
.tbl{width:100%;border-collapse:collapse;font-size:12px}
.tbl thead th{font-size:10px;font-weight:600;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;padding:10px 14px;border-bottom:1px solid var(--b1);text-align:left;white-space:nowrap;background:var(--bg2)}
.tbl tbody td{padding:10px 14px;border-bottom:1px solid rgba(42,45,58,.5);color:var(--txt2);vertical-align:middle}
.tbl tbody tr:last-child td{border-bottom:none}
.tbl tbody tr:hover td{background:var(--bg3);color:var(--txt)}
.td-bold{color:var(--txt);font-weight:500}
.td-mono{font-family:'JetBrains Mono',monospace;font-size:11px}

/* ── PILLS ── */
.tag{display:inline-flex;align-items:center;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:.3px;text-transform:uppercase}
.tag-win{background:var(--green-dim);color:var(--green)}
.tag-loss{background:var(--red-dim);color:var(--red)}
.tag-be{background:var(--amber-dim);color:var(--amber)}
.tag-long{background:var(--green-dim);color:var(--green)}
.tag-short{background:var(--red-dim);color:var(--red)}
.tag-manual{background:var(--bg4);color:var(--txt3)}
.tag-mt5{background:var(--blue-dim);color:var(--blue)}

/* ── FORMS ── */
.form-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}
.fg{display:flex;flex-direction:column;gap:4px}
.fl{font-size:10px;font-weight:500;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px}
.fi,.fs,.fta{background:var(--bg3);border:1px solid var(--b1);border-radius:6px;padding:8px 12px;color:var(--txt);font-family:'Inter',sans-serif;font-size:12px;outline:none;transition:border .15s;width:100%}
.fi:focus,.fs:focus,.fta:focus{border-color:var(--accent)}
.fta{resize:vertical;min-height:72px}

/* ── BUTTONS ── */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 14px;border-radius:6px;border:none;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;white-space:nowrap}
.btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{background:#4a5adf}
.btn-ghost{background:none;border:1px solid var(--b1);color:var(--txt2)}.btn-ghost:hover{border-color:var(--b3);color:var(--txt)}
.btn-danger{background:var(--red-dim);color:var(--red);border:1px solid rgba(239,68,68,.2)}.btn-danger:hover{background:rgba(239,68,68,.15)}
.btn-sm{padding:4px 10px;font-size:11px}
.btn:disabled{opacity:.4;cursor:not-allowed}

/* ── CALENDAR ── */
.cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.cal-month{font-size:13px;font-weight:600;color:var(--txt)}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.cal-dow{text-align:center;font-size:9px;font-weight:600;color:var(--txt4);padding:6px 0;text-transform:uppercase;letter-spacing:.5px}
.cal-cell{min-height:68px;background:var(--bg3);border:1px solid var(--b1);border-radius:6px;padding:7px;transition:all .15s;position:relative}
.cal-cell.ht{cursor:pointer}.cal-cell.ht:hover{border-color:var(--b3);background:var(--bg4)}
.cal-cell.tod{border-color:var(--accent)!important}
.cal-cell.sel{border-color:var(--accent);background:var(--bg4)}
.cal-cell.empty{background:transparent;border-color:transparent}
.cal-cell.day-g{border-left:2px solid var(--green)}
.cal-cell.day-r{border-left:2px solid var(--red)}
.cal-cell.day-a{border-left:2px solid var(--amber)}
.cal-dnum{font-size:10px;color:var(--txt3);margin-bottom:4px;font-weight:500}
.cal-cell.tod .cal-dnum{color:var(--accent);font-weight:700}
.cal-dots{display:flex;flex-wrap:wrap;gap:2px;margin-bottom:3px}
.cal-dot{width:5px;height:5px;border-radius:1px}
.cal-pnl{font-size:9px;font-weight:700;font-family:'JetBrains Mono',monospace}

/* ── ERROR ITEMS ── */
.err-item{display:flex;gap:12px;padding:14px 16px;border-bottom:1px solid var(--b1)}
.err-item:last-child{border-bottom:none}
.err-icon{width:32px;height:32px;border-radius:7px;background:var(--red-dim);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.err-title{font-size:12px;font-weight:600;color:var(--txt);margin-bottom:3px;display:flex;align-items:center;gap:8px}
.err-cnt{font-size:10px;color:var(--red);background:var(--red-dim);padding:1px 6px;border-radius:10px;font-weight:700}
.err-desc{font-size:11px;color:var(--txt3);line-height:1.5}
.err-fix{font-size:11px;color:var(--green);margin-top:5px}

/* ── RULE ITEMS ── */
.rule{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:var(--bg3);border:1px solid var(--b1);border-radius:7px;margin-bottom:6px}
.rule-num{width:20px;height:20px;min-width:20px;border-radius:5px;background:var(--accent-dim);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700}
.rule-txt{font-size:12px;color:var(--txt2);flex:1;line-height:1.5}
.rule-del{background:none;border:none;color:var(--txt4);cursor:pointer;font-size:14px;padding:0 2px;flex-shrink:0;transition:color .15s}
.rule-del:hover{color:var(--red)}

/* ── CHAT ── */
.chat-wrap{display:flex;flex-direction:column;height:460px}
.chat-msgs{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding:16px;min-height:0}
.chat-msg{padding:12px 14px;border-radius:8px;font-size:12px;line-height:1.7}
.chat-msg.user{background:var(--accent-dim);border:1px solid rgba(91,106,240,.2);align-self:flex-end;max-width:75%}
.chat-msg.ai{background:var(--bg3);border:1px solid var(--b1);align-self:flex-start;max-width:95%;white-space:pre-wrap;color:var(--txt2)}
.chat-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}
.chat-msg.user .chat-lbl{color:var(--accent)}.chat-msg.ai .chat-lbl{color:var(--txt3)}
.chat-input{display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--b1)}

/* ── TOGGLE ── */
.toggle{position:relative;width:36px;height:20px;flex-shrink:0}
.toggle input{opacity:0;width:0;height:0}
.tslider{position:absolute;inset:0;background:var(--bg4);border:1px solid var(--b2);border-radius:10px;cursor:pointer;transition:.2s}
.tslider::before{content:'';position:absolute;width:14px;height:14px;left:2px;top:2px;background:var(--txt4);border-radius:50%;transition:.2s}
.toggle input:checked+.tslider{background:rgba(34,197,94,.15);border-color:rgba(34,197,94,.3)}
.toggle input:checked+.tslider::before{transform:translateX(16px);background:var(--green)}

/* ── SETTINGS ROWS ── */
.set-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--b1)}
.set-row:last-child{border-bottom:none}
.set-row-label{font-size:12px;font-weight:500;color:var(--txt)}
.set-row-sub{font-size:11px;color:var(--txt3);margin-top:2px}
.api-key{background:var(--bg3);border:1px solid var(--b1);border-radius:6px;padding:8px 12px;font-size:11px;color:var(--txt3);font-family:'JetBrains Mono',monospace;word-break:break-all;margin-bottom:8px}

/* ── KILL SWITCH BANNER ── */
.ks-banner{background:rgba(239,68,68,.06);border-bottom:1px solid rgba(239,68,68,.2);padding:10px 24px;display:flex;align-items:center;gap:10px;flex-shrink:0}
.ks-dot{width:7px;height:7px;border-radius:50%;background:var(--red);animation:pulse 1.5s infinite}
.ks-text{font-size:12px;color:var(--red);font-weight:600}
.ks-sub{font-size:11px;color:rgba(239,68,68,.6);margin-left:6px}

/* ── MODAL ── */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
.modal{background:var(--bg2);border:1px solid var(--b2);border-radius:12px;padding:24px;width:95%;max-width:580px;max-height:90vh;overflow-y:auto}
.modal-title{font-size:16px;font-weight:700;color:var(--txt);margin-bottom:4px}
.modal-sub{font-size:12px;color:var(--txt3);margin-bottom:20px}

/* ── UPGRADE ── */
.upgrade-wrap{text-align:center;padding:32px 20px}
.upgrade-icon{font-size:40px;margin-bottom:12px}
.upgrade-title{font-size:18px;font-weight:700;color:var(--txt);margin-bottom:6px}
.upgrade-desc{font-size:12px;color:var(--txt3);line-height:1.7;max-width:320px;margin:0 auto 20px}
.upgrade-price{font-size:32px;font-weight:700;color:var(--txt);margin-bottom:4px;font-family:'JetBrains Mono',monospace}
.upgrade-feats{text-align:left;background:var(--bg3);border-radius:8px;padding:14px;margin-bottom:18px}
.ufeat{font-size:11px;color:var(--txt2);padding:5px 0;border-bottom:1px solid var(--b1);display:flex;align-items:center;gap:8px}
.ufeat:last-child{border-bottom:none}
.ufeat::before{content:'✓';color:var(--green);font-weight:700;font-size:12px}

/* ── MISC ── */
.divider{border:none;border-top:1px solid var(--b1);margin:16px 0}
.flex{display:flex}.gap2{gap:8px}.gap3{gap:12px}.ac{align-items:center}.jb{justify-content:space-between}.jc{justify-content:center}
.mt2{margin-top:8px}.mt3{margin-top:12px}.mb3{margin-bottom:12px}.mb4{margin-bottom:16px}
.prog{height:4px;background:var(--bg4);border-radius:2px;overflow:hidden}
.prog-f{height:100%;border-radius:2px;transition:width .4s}
.empty-state{text-align:center;padding:48px 24px;color:var(--txt4);font-size:12px}
.spin{display:inline-block;border-radius:50%;animation:spin .7s linear infinite}
.spin-page{width:28px;height:28px;border:2px solid var(--b2);border-top-color:var(--accent)}
.spin-sm{width:13px;height:13px;border:2px solid rgba(255,255,255,.2);border-top-color:#fff}
.spin-blue{width:12px;height:12px;border:2px solid var(--blue-dim);border-top-color:var(--blue)}
.qp{display:block;width:100%;text-align:left;padding:8px 10px;background:var(--bg3);border:1px solid var(--b1);border-radius:6px;font-family:'Inter',sans-serif;font-size:11px;color:var(--txt3);cursor:pointer;margin-bottom:5px;transition:all .15s}
.qp:hover{border-color:var(--b3);color:var(--txt2)}
.load-page{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg)}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--b2);border-radius:2px}::-webkit-scrollbar-thumb:hover{background:var(--b3)}
`;

// ── AUTH ─────────────────────────────────────────────────────────────────────
function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handle = async () => {
    setError(""); setSuccess(""); setLoading(true);
    if (mode === "login") {
      const { error } = await signIn(email, password);
      if (error) setError(error.message);
    } else {
      if (!name.trim()) { setError("Please enter your name."); setLoading(false); return; }
      const { error } = await signUp(email, password, name);
      if (error) setError(error.message);
      else setSuccess("Account created! You can now log in.");
    }
    setLoading(false);
  };

  return (
    <div className="auth-wrap">
      <div className="auth-left">
        <div style={{maxWidth:400}}>
          <div style={{fontSize:32,fontWeight:800,color:"var(--txt)",letterSpacing:"-1.5px",marginBottom:8}}>
            Trade<span style={{color:"var(--accent)"}}>IQ</span>
          </div>
          <div style={{fontSize:14,color:"var(--txt3)",marginBottom:48,lineHeight:1.6}}>
            The professional trading journal built for funded traders. Track executions, detect errors, and get AI coaching based on your own strategy.
          </div>
          <div className="auth-features">
            {[
              {icon:"📊",title:"Smart Trade Journal",desc:"Log trades with auto-calculated R, session tracking, and execution notes."},
              {icon:"🤖",title:"AI Coach",desc:"Feed Claude your strategy rules. It monitors every trade against them."},
              {icon:"🔒",title:"Kill Switch",desc:"Auto-locks your MT5 account when daily loss or trade limits are hit."},
              {icon:"📡",title:"MT5 & TV Sync",desc:"Trades auto-imported from MetaTrader 5 or TradingView webhooks."},
            ].map((f,i)=>(
              <div key={i} className="auth-feat">
                <div className="auth-feat-icon">{f.icon}</div>
                <div><div className="auth-feat-title">{f.title}</div><div className="auth-feat-desc">{f.desc}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="auth-right">
        <div className="auth-brand">Trade<span>IQ</span></div>
        <div className="auth-tagline">Smart Trade Journal · AI Coach · Kill Switch</div>
        <div className="auth-heading">{mode==="login"?"Welcome back":"Create your account"}</div>
        <div className="auth-sub">{mode==="login"?"Log in to your TradeIQ dashboard":"Free to start. No credit card required."}</div>
        <div className="auth-tabs">
          <button className={`atab${mode==="login"?" on":""}`} onClick={()=>{setMode("login");setError("");setSuccess("");}}>Log In</button>
          <button className={`atab${mode==="signup"?" on":""}`} onClick={()=>{setMode("signup");setError("");setSuccess("");}}>Sign Up</button>
        </div>
        {error&&<div className="auth-err">{error}</div>}
        {success&&<div className="auth-ok">{success}</div>}
        {mode==="signup"&&<div className="fg" style={{marginBottom:14}}>
          <label className="auth-label">Full Name</label>
          <input className="auth-input" placeholder="Lewis Orora" value={name} onChange={e=>setName(e.target.value)}/>
        </div>}
        <div className="fg" style={{marginBottom:14}}>
          <label className="auth-label">Email address</label>
          <input className="auth-input" type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        </div>
        <div className="fg" style={{marginBottom:20}}>
          <label className="auth-label">Password</label>
          <input className="auth-input" type="password" placeholder="8+ characters" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        </div>
        <button className="auth-btn" onClick={handle} disabled={loading}>
          {loading?<span className="spin spin-sm"/>:mode==="login"?"Sign In →":"Create Account →"}
        </button>
      </div>
    </div>
  );
}

// ── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard() {
  const { user, profile, isPro, signOut } = useAuth();
  const [tab, setTab] = useState("overview");
  const [sideOpen, setSideOpen] = useState(true);
  const [trades, setTrades] = useState([]);
  const [strategy, setStrategy] = useState([]);
  const [ksRules, setKsRules] = useState({ enabled:false, daily_r_limit:-3, max_trades_session:2, max_consec_losses:2 });
  const [ksState, setKsState] = useState({ is_locked:false, reasons:[] });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showUpg, setShowUpg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calY, setCalY] = useState(new Date().getFullYear());
  const [calM, setCalM] = useState(new Date().getMonth());
  const [selDay, setSelDay] = useState(null);
  const [fPair, setFPair] = useState("ALL");
  const [fRes, setFRes] = useState("ALL");
  const [newRule, setNewRule] = useState("");
  const [aiMsgs, setAiMsgs] = useState([{role:"ai",text:"Hello! I'm your AI Trade Coach.\n\nI have full access to your trade history and strategy rules. Ask me about your error patterns, which sessions to cut, what's hurting your win rate, or anything else about your trading."}]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoad, setAiLoad] = useState(false);
  const [nt, setNt] = useState({ date:new Date().toISOString().split("T")[0], pair:"XAUUSD", direction:"LONG", session:"London", entry:"", exit_price:"", sl:"", tp:"", result:"WIN", notes:"" });

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [t, r, ks, ksr] = await Promise.all([
      supabase.from("trades").select("*").eq("user_id", user.id).order("date", { ascending:false }),
      supabase.from("strategy_rules").select("*").eq("user_id", user.id).order("order_index"),
      supabase.from("kill_switch_state").select("*").eq("user_id", user.id).single(),
      supabase.from("kill_switch_rules").select("*").eq("user_id", user.id).single(),
    ]);
    if (t.data) setTrades(t.data);
    if (r.data) setStrategy(r.data);
    if (ks.data) setKsState(ks.data);
    if (ksr.data) setKsRules(ksr.data);
    setLoading(false);
  };

  const addTrade = async () => {
    if (!nt.entry || !nt.exit_price) return;
    setSaving(true);
    const e=parseFloat(nt.entry), sl=parseFloat(nt.sl)||0, tp=parseFloat(nt.tp)||0;
    const risk=Math.abs(e-sl)||1, rr=tp&&sl?Math.abs(tp-e)/risk:1;
    const rm=nt.result==="WIN"?+Math.min(rr,4).toFixed(2):nt.result==="LOSS"?-1:0;
    const { data, error } = await supabase.from("trades").insert({ user_id:user.id, ...nt, r_multiple:rm, rr_ratio:+rr.toFixed(2), errors:[], source:"manual" }).select().single();
    if (!error && data) setTrades(p=>[data,...p]);
    setSaving(false); setShowAdd(false);
    setNt({ date:new Date().toISOString().split("T")[0], pair:"XAUUSD", direction:"LONG", session:"London", entry:"", exit_price:"", sl:"", tp:"", result:"WIN", notes:"" });
  };
  const delTrade = async (id) => { await supabase.from("trades").delete().eq("id", id); setTrades(p=>p.filter(t=>t.id!==id)); };
  const addRule = async () => {
    if (!newRule.trim()) return;
    const { data } = await supabase.from("strategy_rules").insert({ user_id:user.id, rule_text:newRule.trim(), order_index:strategy.length }).select().single();
    if (data) setStrategy(p=>[...p,data]);
    setNewRule("");
  };
  const delRule = async (id) => { await supabase.from("strategy_rules").delete().eq("id", id); setStrategy(p=>p.filter(r=>r.id!==id)); };
  const updateKS = async (key, val) => { setKsRules(p=>({...p,[key]:val})); await supabase.from("kill_switch_rules").update({[key]:val}).eq("user_id", user.id); };

  const sendAI = useCallback(async () => {
    if (!aiInput.trim() || aiLoad) return;
    if (!isPro) { setShowUpg(true); return; }
    const msg = aiInput.trim();
    setAiMsgs(p=>[...p,{role:"user",text:msg}]);
    setAiInput(""); setAiLoad(true);
    const stats = calcStats(trades);
    const errors = getErrors(trades);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1000,
          system:`You are an elite ICT/SMC trading coach. Be direct and specific. Reference exact trade dates.

STRATEGY:\n${strategy.map((r,i)=>`${i+1}. ${r.rule_text}`).join("\n")||"No rules set yet."}

TRADES (${trades.length}):\n${JSON.stringify(trades.slice(0,40).map(t=>({date:t.date,pair:t.pair,dir:t.direction,session:t.session,result:t.result,rm:t.r_multiple,errors:t.errors})))}

STATS: WR=${f(stats.wr)}% | R=${f(stats.totalR)} | PF=${f(stats.pf)} | Exp=${f(stats.exp)}R
ERRORS: ${errors.map(([e,c])=>`${e}(${c}x)`).join(", ")||"none"}`,
          messages:[{role:"user",content:msg}]
        })
      });
      const d = await res.json();
      setAiMsgs(p=>[...p,{role:"ai",text:d.content?.[0]?.text||"No response."}]);
    } catch { setAiMsgs(p=>[...p,{role:"ai",text:"Connection error. Please try again."}]); }
    setAiLoad(false);
  }, [aiInput,aiLoad,isPro,trades,strategy]);

  const stats   = useMemo(()=>calcStats(trades),[trades]);
  const equity  = useMemo(()=>getEquity(trades),[trades]);
  const monSt   = useMemo(()=>getMonthly(trades),[trades]);
  const sessSt  = useMemo(()=>getSessions(trades),[trades]);
  const errors  = useMemo(()=>getErrors(trades),[trades]);
  const byDate  = useMemo(()=>groupDate(trades),[trades]);
  const filtered = useMemo(()=>trades.filter(t=>(fPair==="ALL"||t.pair===fPair)&&(fRes==="ALL"||t.result===fRes)),[trades,fPair,fRes]);

  const firstDow=new Date(calY,calM,1).getDay(), daysInM=new Date(calY,calM+1,0).getDate();
  const today=new Date();
  const getDS=d=>`${calY}-${String(calM+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const calCells=[]; for(let i=0;i<firstDow;i++)calCells.push(null); for(let d=1;d<=daysInM;d++)calCells.push(d);

  if (loading) return <div className="load-page"><span className="spin spin-page"/></div>;

  const NAV=[
    {id:"overview",icon:"▦",label:"Overview"},
    {id:"journal", icon:"≡",label:"Journal"},
    {id:"calendar",icon:"□",label:"Calendar"},
    {id:"charts",  icon:"↗",label:"Analytics"},
    {id:"errors",  icon:"⚠",label:"Errors",badge:errors.length||null},
    {id:"ai",      icon:"✦",label:"AI Coach",badge:isPro?null:"PRO",badgeAmber:true},
    {id:"settings",icon:"◎",label:"Settings"},
  ];

  const Rval = (rm) => {
    const v = rm||0;
    return <span style={{color:v>0?"var(--green)":v<0?"var(--red)":"var(--amber)",fontWeight:600,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{sgn(v)}{f(v)}R</span>;
  };

  return (
    <>
      {ksState.is_locked&&(
        <div className="ks-banner">
          <div className="ks-dot"/>
          <span className="ks-text">KILL SWITCH ACTIVE</span>
          <span className="ks-sub">{(ksState.reasons||[]).join(" · ")}</span>
        </div>
      )}
      <div className="shell">
        {/* SIDEBAR */}
        <aside className={`sb${sideOpen?" open":""}`}>
          {sideOpen
            ?<div className="sb-logo-full" onClick={()=>setSideOpen(false)}>
                <div className="sb-logo">T</div>
                <div className="sb-logo-text">Trade<span>IQ</span></div>
              </div>
            :<div className="sb-logo" onClick={()=>setSideOpen(true)}>T</div>
          }
          <div className="sb-nav">
            {NAV.map(n=>(
              <button key={n.id} className={`sbn${tab===n.id?" on":""}`} onClick={()=>setTab(n.id)}>
                <span className="sbn-icon">{n.icon}</span>
                <span className="sbn-label">{n.label}</span>
                {n.badge&&<span className={`sbn-badge${n.badgeAmber?" amber":""}`}>{n.badge}</span>}
              </button>
            ))}
          </div>
          <div className="sb-bottom">
            <div className="sb-user" onClick={signOut} title="Sign out">
              <div className="sb-avatar">{user?.email?.[0]?.toUpperCase()||"U"}</div>
              {sideOpen&&<div className="sb-user-info">
                <div className="sb-user-email">{user?.email}</div>
                <div className="sb-user-plan">{isPro?"PRO":"Free"}</div>
              </div>}
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <div className="main">
          {/* TOP BAR */}
          <div className="topbar">
            <div>
              <div className="topbar-title">
                {tab==="overview"&&"Overview"}
                {tab==="journal"&&"Trade Journal"}
                {tab==="calendar"&&"Calendar"}
                {tab==="charts"&&"Analytics"}
                {tab==="errors"&&"Error Detection"}
                {tab==="ai"&&"AI Coach"}
                {tab==="settings"&&"Settings"}
              </div>
            </div>
            <div className="topbar-sub">{stats.total} trades · {new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</div>
            <div className="flex gap2 ac">
              {tab==="journal"&&<button className="tb-btn primary" onClick={()=>setShowAdd(true)}>+ Log Trade</button>}
              {!isPro&&<button className="tb-btn" onClick={()=>setShowUpg(true)}>✦ Upgrade</button>}
            </div>
          </div>

          {/* PAGE CONTENT */}
          <div className="page page-anim">

            {/* ── OVERVIEW ── */}
            {tab==="overview"&&<>
              <div className="stat-row">
                {[
                  {l:"Win Rate",v:`${f(stats.wr,1)}%`,c:stats.wr>=50?"cv-green":"cv-red",meta:`${stats.wins}W  ${stats.losses}L  ${stats.bes}BE`},
                  {l:"Total R",v:`${sgn(stats.totalR)}${f(stats.totalR)}`,c:stats.totalR>=0?"cv-green":"cv-red",meta:`across ${stats.total} trades`},
                  {l:"Profit Factor",v:f(stats.pf),c:stats.pf>=1.5?"cv-green":stats.pf>=1?"cv-amber":"cv-red",meta:"gross W / gross L"},
                  {l:"Expectancy",v:`${f(stats.exp)}R`,c:stats.exp>=0?"cv-green":"cv-red",meta:"per-trade average"},
                  {l:"Avg Win",v:`${f(stats.avgWin)}R`,c:"cv-green",meta:`avg loss ${f(stats.avgLoss)}R`},
                  {l:"Total Trades",v:stats.total,c:"cv-txt",meta:`${stats.bes} breakeven`},
                ].map((s,i)=>(
                  <div key={i} className="stat-cell">
                    <div className="stat-cell-label">{s.l}</div>
                    <div className={`stat-cell-val ${s.c}`}>{s.v}</div>
                    <div className="stat-cell-meta">{s.meta}</div>
                  </div>
                ))}
              </div>
              <div className="g2 mb4">
                <div className="panel">
                  <div className="panel-header"><div className="panel-title"><span className="panel-title-dot"/>Equity Curve (R)</div></div>
                  <div className="panel-body">
                    {equity.length===0?<div className="empty-state">Log trades to see your equity curve</div>:
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={equity} margin={{top:4,right:4,bottom:0,left:-20}}>
                        <defs><linearGradient id="eq" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={.15}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient></defs>
                        <CartesianGrid strokeDasharray="2 4" stroke="#2a2d3a" vertical={false}/>
                        <XAxis dataKey="n" tick={{fill:"#4b5263",fontSize:9}} tickLine={false} axisLine={false}/>
                        <YAxis tick={{fill:"#4b5263",fontSize:9}} tickLine={false} axisLine={false} tickFormatter={v=>`${v}R`}/>
                        <Tooltip content={<TTip/>}/><ReferenceLine y={0} stroke="#2a2d3a" strokeDasharray="3 3"/>
                        <Area type="monotone" dataKey="r" name="R" stroke="#22c55e" strokeWidth={1.5} fill="url(#eq)" dot={false} activeDot={{r:3,fill:"#22c55e"}}/>
                      </AreaChart>
                    </ResponsiveContainer>}
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-header"><div className="panel-title"><span className="panel-title-dot"/>Monthly P&L (R)</div></div>
                  <div className="panel-body">
                    {monSt.length===0?<div className="empty-state">No monthly data yet</div>:
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={monSt} margin={{top:4,right:4,bottom:0,left:-20}}>
                        <CartesianGrid strokeDasharray="2 4" stroke="#2a2d3a" vertical={false}/>
                        <XAxis dataKey="month" tick={{fill:"#4b5263",fontSize:9}} tickLine={false} axisLine={false}/>
                        <YAxis tick={{fill:"#4b5263",fontSize:9}} tickLine={false} axisLine={false} tickFormatter={v=>`${v}R`}/>
                        <Tooltip content={<TTip/>}/><ReferenceLine y={0} stroke="#2a2d3a"/>
                        <Bar dataKey="R" name="R" radius={[3,3,0,0]}>{monSt.map((m,i)=><Bar key={i} fill={m.R>=0?"#22c55e":"#ef4444"} opacity={.85}/>)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>}
                  </div>
                </div>
              </div>
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title"><span className="panel-title-dot"/>Recent Trades</div>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setTab("journal")}>View all →</button>
                </div>
                <div className="panel-body-np">
                  {trades.length===0?<div className="empty-state">No trades yet — log your first trade in the Journal tab</div>:
                  <div className="tbl-wrap"><table className="tbl">
                    <thead><tr><th>Date</th><th>Pair</th><th>Dir</th><th>Session</th><th>Entry</th><th>Exit</th><th>Result</th><th>R</th><th>Source</th></tr></thead>
                    <tbody>{trades.slice(0,8).map(t=>(
                      <tr key={t.id}>
                        <td className="td-mono">{t.date}</td>
                        <td className="td-bold">{t.pair}</td>
                        <td><span className={`tag ${t.direction==="LONG"?"tag-long":"tag-short"}`}>{t.direction}</span></td>
                        <td style={{fontSize:11,color:"var(--txt3)"}}>{t.session}</td>
                        <td className="td-mono">{t.entry}</td>
                        <td className="td-mono">{t.exit_price}</td>
                        <td><span className={`tag ${t.result==="WIN"?"tag-win":t.result==="LOSS"?"tag-loss":"tag-be"}`}>{t.result}</span></td>
                        <td>{Rval(t.r_multiple)}</td>
                        <td><span className="tag tag-manual">{t.source||"manual"}</span></td>
                      </tr>
                    ))}</tbody>
                  </table></div>}
                </div>
              </div>
            </>}

            {/* ── JOURNAL ── */}
            {tab==="journal"&&<>
              <div className="flex ac gap2 mb4">
                <select className="fs" style={{width:120}} value={fPair} onChange={e=>setFPair(e.target.value)}><option value="ALL">All Pairs</option>{PAIRS.map(p=><option key={p}>{p}</option>)}</select>
                <select className="fs" style={{width:110}} value={fRes} onChange={e=>setFRes(e.target.value)}><option value="ALL">All Results</option>{["WIN","LOSS","BE"].map(r=><option key={r}>{r}</option>)}</select>
                <div style={{fontSize:11,color:"var(--txt3)",marginLeft:4}}>{filtered.length} trades</div>
              </div>
              <div className="panel">
                <div className="panel-body-np">
                  {filtered.length===0?<div className="empty-state">No trades match your filters</div>:
                  <div className="tbl-wrap"><table className="tbl">
                    <thead><tr><th>Date</th><th>Pair</th><th>Dir</th><th>Session</th><th>Entry</th><th>Exit</th><th>SL</th><th>TP</th><th>Result</th><th>R</th><th>Errors</th><th>Notes</th><th></th></tr></thead>
                    <tbody>{filtered.map(t=>(
                      <tr key={t.id}>
                        <td className="td-mono">{t.date}</td>
                        <td className="td-bold">{t.pair}</td>
                        <td><span className={`tag ${t.direction==="LONG"?"tag-long":"tag-short"}`}>{t.direction}</span></td>
                        <td style={{fontSize:10,color:"var(--txt3)"}}>{t.session}</td>
                        <td className="td-mono">{t.entry}</td>
                        <td className="td-mono">{t.exit_price}</td>
                        <td className="td-mono" style={{color:"var(--txt3)"}}>{t.sl||"—"}</td>
                        <td className="td-mono" style={{color:"var(--txt3)"}}>{t.tp||"—"}</td>
                        <td><span className={`tag ${t.result==="WIN"?"tag-win":t.result==="LOSS"?"tag-loss":"tag-be"}`}>{t.result}</span></td>
                        <td>{Rval(t.r_multiple)}</td>
                        <td>{(t.errors||[]).length?(t.errors||[]).map(e=><span key={e} title={ERRS[e]?.label} style={{fontSize:13,marginRight:2,cursor:"default"}}>{ERRS[e]?.icon}</span>):<span style={{color:"var(--txt4)"}}>—</span>}</td>
                        <td style={{maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:11,color:"var(--txt3)"}}>{t.notes||"—"}</td>
                        <td><button className="btn btn-danger btn-sm" onClick={()=>delTrade(t.id)}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table></div>}
                </div>
              </div>
            </>}

            {/* ── CALENDAR ── */}
            {tab==="calendar"&&<>
              <div className={selDay?"g31":""} style={{alignItems:"start"}}>
                <div className="panel">
                  <div className="panel-header">
                    <div className="panel-title"><span className="panel-title-dot"/>{MONTHS[calM]} {calY}</div>
                    <div className="flex gap2 ac">
                      <button className="btn btn-ghost btn-sm" onClick={()=>{ if(calM===0){setCalM(11);setCalY(y=>y-1);}else setCalM(m=>m-1); }}>‹</button>
                      <button className="btn btn-ghost btn-sm" onClick={()=>{ if(calM===11){setCalM(0);setCalY(y=>y+1);}else setCalM(m=>m+1); }}>›</button>
                    </div>
                  </div>
                  <div className="panel-body">
                    <div className="cal-grid" style={{marginBottom:8}}>
                      {DOWS.map(d=><div key={d} className="cal-dow">{d}</div>)}
                      {calCells.map((d,i)=>{
                        if(!d) return <div key={i} className="cal-cell empty"/>;
                        const ds=getDS(d), dt=byDate[ds]||[], pnl=dt.reduce((s,t)=>s+(t.r_multiple||0),0);
                        const isToday=today.getFullYear()===calY&&today.getMonth()===calM&&today.getDate()===d;
                        const dc=dt.length?(pnl>0?"day-g":pnl<0?"day-r":"day-a"):"";
                        return (
                          <div key={i} className={`cal-cell ${dc}${dt.length?" ht":""}${isToday?" tod":""}${selDay===d?" sel":""}`}
                            onClick={()=>dt.length&&setSelDay(selDay===d?null:d)}>
                            <div className="cal-dnum">{d}</div>
                            <div className="cal-dots">{dt.map((t,j)=><div key={j} className="cal-dot" style={{background:t.result==="WIN"?"var(--green)":t.result==="LOSS"?"var(--red)":"var(--amber)"}}/>)}</div>
                            {dt.length>0&&<div className="cal-pnl" style={{color:pnl>0?"var(--green)":pnl<0?"var(--red)":"var(--amber)"}}>{sgn(pnl)}{f(pnl)}R</div>}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap3" style={{borderTop:"1px solid var(--b1)",paddingTop:10}}>
                      {[["var(--green)","Win"],["var(--red)","Loss"],["var(--amber)","Breakeven"]].map(([c,l])=>(
                        <div key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"var(--txt4)"}}><div style={{width:8,height:8,borderRadius:1,background:c}}/>{l}</div>
                      ))}
                    </div>
                  </div>
                </div>
                {selDay&&<div className="panel" style={{alignSelf:"start"}}>
                  <div className="panel-header">
                    <div className="panel-title"><span className="panel-title-dot"/>{MONTHS[calM]} {selDay}</div>
                    <button className="btn btn-ghost btn-sm" onClick={()=>setSelDay(null)}>✕</button>
                  </div>
                  <div className="panel-body">
                    {(byDate[getDS(selDay)]||[]).map(t=>(
                      <div key={t.id} style={{padding:"12px 0",borderBottom:"1px solid var(--b1)"}}>
                        <div className="flex ac jb mb3">
                          <span className="td-bold" style={{fontSize:13}}>{t.pair}</span>
                          <div className="flex gap2 ac">{Rval(t.r_multiple)}</div>
                        </div>
                        <div className="flex gap2 mb3">
                          <span className={`tag ${t.direction==="LONG"?"tag-long":"tag-short"}`}>{t.direction}</span>
                          <span className={`tag ${t.result==="WIN"?"tag-win":t.result==="LOSS"?"tag-loss":"tag-be"}`}>{t.result}</span>
                          <span style={{fontSize:10,color:"var(--txt3)"}}>{t.session}</span>
                        </div>
                        {(t.errors||[]).length>0&&<div style={{marginBottom:8}}>{(t.errors||[]).map(e=><span key={e} style={{fontSize:11,color:"var(--txt3)",marginRight:8}}>{ERRS[e]?.icon} {ERRS[e]?.label}</span>)}</div>}
                        {t.notes&&<div style={{fontSize:11,color:"var(--txt3)",lineHeight:1.5}}>{t.notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>}
              </div>
            </>}

            {/* ── ANALYTICS ── */}
            {tab==="charts"&&<>
              <div className="g2 mb4">
                <div className="panel">
                  <div className="panel-header"><div className="panel-title"><span className="panel-title-dot"/>Session Performance</div></div>
                  <div className="panel-body">
                    {sessSt.length===0?<div className="empty-state">Log trades to see session data</div>:
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={sessSt} margin={{top:4,right:4,bottom:0,left:-20}}>
                        <CartesianGrid strokeDasharray="2 4" stroke="#2a2d3a" vertical={false}/>
                        <XAxis dataKey="session" tick={{fill:"#4b5263",fontSize:9}} tickLine={false} axisLine={false}/>
                        <YAxis tick={{fill:"#4b5263",fontSize:9}} tickLine={false} axisLine={false} tickFormatter={v=>`${v}R`}/>
                        <Tooltip content={<TTip/>}/><ReferenceLine y={0} stroke="#2a2d3a"/>
                        <Bar dataKey="R" name="R" radius={[3,3,0,0]}>{sessSt.map((s,i)=><Bar key={i} fill={s.R>=0?"#22c55e":"#ef4444"} opacity={.85}/>)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>}
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-header"><div className="panel-title"><span className="panel-title-dot"/>Pair Performance</div></div>
                  <div className="panel-body-np">
                    {trades.length===0?<div className="empty-state">No pair data yet</div>:
                    <table className="tbl">
                      <thead><tr><th>Pair</th><th>Trades</th><th>WR</th><th>Total R</th><th>R/Trade</th></tr></thead>
                      <tbody>{Object.entries(trades.reduce((m,t)=>{ if(!m[t.pair])m[t.pair]={R:0,wins:0,total:0}; m[t.pair].R+=(t.r_multiple||0); m[t.pair].total++; if(t.result==="WIN")m[t.pair].wins++; return m; },{})).map(([pair,p])=>{
                        const wr=+(p.wins/p.total*100).toFixed(1), R=+p.R.toFixed(2);
                        return <tr key={pair}>
                          <td className="td-bold">{pair}</td><td>{p.total}</td>
                          <td style={{color:wr>=50?"var(--green)":"var(--red)",fontWeight:600}}>{wr}%</td>
                          <td>{Rval(R)}</td>
                          <td>{Rval(+(R/p.total).toFixed(2))}</td>
                        </tr>;
                      })}</tbody>
                    </table>}
                  </div>
                </div>
              </div>
              <div className="panel">
                <div className="panel-header"><div className="panel-title"><span className="panel-title-dot"/>Monthly Breakdown</div></div>
                <div className="panel-body-np">
                  {monSt.length===0?<div className="empty-state">No monthly data yet</div>:
                  <table className="tbl">
                    <thead><tr><th>Month</th><th>Trades</th><th>Wins</th><th>Losses</th><th>Win Rate</th><th>Total R</th></tr></thead>
                    <tbody>{monSt.map((m,i)=>{
                      const wr=m.total?+(m.wins/m.total*100).toFixed(1):0;
                      return <tr key={i}>
                        <td className="td-bold">{m.month}</td><td>{m.total}</td>
                        <td style={{color:"var(--green)"}}>{m.wins}</td>
                        <td style={{color:"var(--red)"}}>{m.losses}</td>
                        <td style={{color:wr>=50?"var(--green)":"var(--red)",fontWeight:600}}>{wr}%</td>
                        <td>{Rval(m.R)}</td>
                      </tr>;
                    })}</tbody>
                  </table>}
                </div>
              </div>
            </>}

            {/* ── ERRORS ── */}
            {tab==="errors"&&<>
              {errors.length===0
                ?<div className="panel"><div className="empty-state" style={{padding:"64px 24px"}}>✓ No execution errors detected in your trade history</div></div>
                :<div className="panel">
                  <div className="panel-header"><div className="panel-title"><span className="panel-title-dot"/>{errors.length} error type{errors.length!==1?"s":""} detected</div></div>
                  <div className="panel-body-np">
                    {errors.map(([e,count])=>{ const info=ERRS[e]; if(!info)return null; return (
                      <div key={e} className="err-item">
                        <div className="err-icon">{info.icon}</div>
                        <div style={{flex:1}}>
                          <div className="err-title">{info.label}<span className="err-cnt">×{count}</span></div>
                          <div className="err-desc">{info.desc}</div>
                          <div className="err-fix">→ {info.fix}</div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontSize:20,fontWeight:700,color:"var(--red)",fontFamily:"'JetBrains Mono',monospace"}}>{f(count/trades.length*100,0)}%</div>
                          <div style={{fontSize:10,color:"var(--txt4)"}}>of trades</div>
                        </div>
                      </div>
                    );})}
                  </div>
                </div>
              }
            </>}

            {/* ── AI COACH ── */}
            {tab==="ai"&&<>
              <div className="g13" style={{alignItems:"start"}}>
                <div>
                  <div className="panel mb4">
                    <div className="panel-header"><div className="panel-title"><span className="panel-title-dot"/>Strategy Rules</div></div>
                    <div className="panel-body">
                      {strategy.length===0&&<div style={{fontSize:11,color:"var(--txt4)",marginBottom:12}}>No rules yet. Add your personal trading rules below.</div>}
                      {strategy.map((r,i)=>(
                        <div key={r.id} className="rule">
                          <div className="rule-num">{i+1}</div>
                          <div className="rule-txt">{r.rule_text}</div>
                          <button className="rule-del" onClick={()=>delRule(r.id)}>×</button>
                        </div>
                      ))}
                      <div className="flex gap2 mt3">
                        <input className="fi" style={{flex:1,fontSize:11}} placeholder="Add a rule e.g. Only trade London open..." value={newRule} onChange={e=>setNewRule(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addRule()}/>
                        <button className="btn btn-ghost btn-sm" onClick={addRule}>Add</button>
                      </div>
                    </div>
                  </div>
                  {isPro&&<div className="panel">
                    <div className="panel-header"><div className="panel-title"><span className="panel-title-dot"/>Quick Prompts</div></div>
                    <div className="panel-body">
                      {["What are my biggest error patterns?","Which session should I cut?","Why is my win rate below 50%?","Give me 3 things to fix this week","Compare my error trades vs clean trades","Which pair is costing me the most R?"].map(p=>(
                        <button key={p} className="qp" onClick={()=>setAiInput(p)}>{p}</button>
                      ))}
                    </div>
                  </div>}
                  {!isPro&&<div className="panel">
                    <div className="panel-body" style={{textAlign:"center",padding:"28px 20px"}}>
                      <div style={{fontSize:32,marginBottom:10}}>✦</div>
                      <div style={{fontSize:14,fontWeight:700,color:"var(--txt)",marginBottom:6}}>AI Coach is PRO</div>
                      <div style={{fontSize:11,color:"var(--txt3)",marginBottom:16,lineHeight:1.6}}>Claude analyzes your trades against your strategy rules and gives specific actionable coaching.</div>
                      <button className="btn btn-primary" style={{width:"100%"}} onClick={()=>setShowUpg(true)}>Upgrade to PRO →</button>
                    </div>
                  </div>}
                </div>
                <div className="panel chat-wrap">
                  <div className="chat-msgs">
                    {aiMsgs.map((m,i)=>(
                      <div key={i} className={`chat-msg ${m.role}`}>
                        <div className="chat-lbl">{m.role==="ai"?"AI Coach":"You"}</div>
                        {m.text}
                      </div>
                    ))}
                    {aiLoad&&<div className="chat-msg ai"><div className="chat-lbl">AI Coach</div><div className="flex ac gap2"><span className="spin spin-blue"/><span style={{color:"var(--txt4)",fontSize:11}}>Analyzing…</span></div></div>}
                  </div>
                  <div className="chat-input">
                    <input className="fi" style={{flex:1,fontSize:12}} placeholder={isPro?"Ask about your trades, errors, strategy…":"Upgrade to PRO to use AI Coach"} value={aiInput} disabled={!isPro} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendAI()}/>
                    <button className={`btn ${isPro?"btn-primary":"btn-ghost"}`} onClick={isPro?sendAI:()=>setShowUpg(true)} disabled={aiLoad}>{aiLoad?<span className="spin spin-sm"/>:"Send"}</button>
                  </div>
                </div>
              </div>
            </>}

            {/* ── SETTINGS ── */}
            {tab==="settings"&&<>
              <div className="panel mb4">
                <div className="panel-header"><div className="panel-title"><span className="panel-title-dot"/>Account</div></div>
                <div className="panel-body">
                  <div className="set-row"><div><div className="set-row-label">Email</div></div><div style={{fontSize:12,color:"var(--txt2)",fontFamily:"'JetBrains Mono',monospace"}}>{user?.email}</div></div>
                  <div className="set-row"><div><div className="set-row-label">Plan</div></div><div style={{color:isPro?"var(--green)":"var(--txt3)",fontWeight:600,fontSize:12}}>{isPro?"PRO — Active":"Free"}</div></div>
                  {!isPro&&<div style={{marginTop:14}}><button className="btn btn-primary" onClick={()=>setShowUpg(true)}>✦ Upgrade to PRO</button></div>}
                </div>
              </div>
              <div className="panel mb4">
                <div className="panel-header"><div className="panel-title"><span className="panel-title-dot"/>MT5 Integration</div></div>
                <div className="panel-body">
                  <div className="set-row-sub" style={{marginBottom:12,fontSize:11,color:"var(--txt3)",lineHeight:1.6}}>Install the TradeIQ EA in MetaTrader 5. Paste your API key into the EA settings — trades will sync automatically.</div>
                  <div style={{fontSize:10,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:".5px",fontWeight:600,marginBottom:6}}>Your MT5 API Key</div>
                  <div className="api-key">{profile?.mt5_api_key||"Loading…"}</div>
                  <button className="btn btn-ghost btn-sm" onClick={()=>navigator.clipboard?.writeText(profile?.mt5_api_key||"")}>Copy Key</button>
                </div>
              </div>
              <div className="panel mb4">
                <div className="panel-header"><div className="panel-title"><span className="panel-title-dot"/>TradingView Webhook</div></div>
                <div className="panel-body">
                  <div className="set-row-sub" style={{marginBottom:12,fontSize:11,color:"var(--txt3)",lineHeight:1.6}}>Set this as your TradingView alert webhook URL to auto-log trades from Pine Script alerts.</div>
                  <div className="api-key">https://api.tradeiq.app/webhook/{profile?.webhook_token||"…"}</div>
                  <button className="btn btn-ghost btn-sm" onClick={()=>navigator.clipboard?.writeText(`https://api.tradeiq.app/webhook/${profile?.webhook_token||""}`)}>Copy URL</button>
                </div>
              </div>
              <div className="panel">
                <div className="panel-header"><div className="panel-title"><span className="panel-title-dot"/>Kill Switch Rules</div></div>
                <div className="panel-body">
                  <div className="set-row">
                    <div><div className="set-row-label">Enable Kill Switch</div><div className="set-row-sub">Monitor trades and auto-lock when limits are hit</div></div>
                    <label className="toggle"><input type="checkbox" checked={ksRules.enabled||false} onChange={e=>updateKS("enabled",e.target.checked)}/><span className="tslider"/></label>
                  </div>
                  {[
                    {l:"Daily R Limit",k:"daily_r_limit",sub:"Lock when this R is lost in a day (e.g. -3)"},
                    {l:"Max Trades / Session",k:"max_trades_session",sub:"Block after this many trades per session"},
                    {l:"Consecutive Loss Limit",k:"max_consec_losses",sub:"Lock after this many losses in a row"},
                  ].map(({l,k,sub})=>(
                    <div key={k} className="set-row">
                      <div><div className="set-row-label">{l}</div><div className="set-row-sub">{sub}</div></div>
                      <input className="fi" type="number" style={{width:72,textAlign:"right",fontSize:13,fontFamily:"'JetBrains Mono',monospace"}} value={ksRules[k]||""} onChange={e=>updateKS(k,parseFloat(e.target.value))}/>
                    </div>
                  ))}
                </div>
              </div>
            </>}

          </div>
        </div>
      </div>

      {/* ADD TRADE MODAL */}
      {showAdd&&<div className="overlay" onClick={e=>{if(e.target.className==="overlay")setShowAdd(false)}}>
        <div className="modal">
          <div className="modal-title">Log Trade</div>
          <div className="modal-sub">R is calculated automatically from your SL and TP.</div>
          <div className="form-grid">
            {[{l:"Date",k:"date",t:"date"},{l:"Pair",k:"pair",t:"sel",o:PAIRS},{l:"Direction",k:"direction",t:"sel",o:["LONG","SHORT"]},{l:"Session",k:"session",t:"sel",o:SESSIONS},{l:"Entry Price",k:"entry",t:"number",ph:"0.00000"},{l:"Exit Price",k:"exit_price",t:"number",ph:"0.00000"},{l:"Stop Loss",k:"sl",t:"number",ph:"0.00000"},{l:"Take Profit",k:"tp",t:"number",ph:"0.00000"},{l:"Result",k:"result",t:"sel",o:["WIN","LOSS","BE"]}].map(({l,k,t,o,ph})=>(
              <div key={k} className="fg">
                <label className="fl">{l}</label>
                {t==="sel"?<select className="fs" value={nt[k]} onChange={e=>setNt(p=>({...p,[k]:e.target.value}))}>{o.map(x=><option key={x}>{x}</option>)}</select>
                :<input className="fi" type={t} placeholder={ph} value={nt[k]} onChange={e=>setNt(p=>({...p,[k]:e.target.value}))}/>}
              </div>
            ))}
          </div>
          <div className="fg" style={{marginBottom:20}}>
            <label className="fl">Notes / Confluences</label>
            <textarea className="fta" placeholder="Setup, confluences, what happened..." value={nt.notes} onChange={e=>setNt(p=>({...p,notes:e.target.value}))}/>
          </div>
          <div className="flex gap2 jb">
            <button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={addTrade} disabled={saving}>{saving?<span className="spin spin-sm"/>:"Save Trade"}</button>
          </div>
        </div>
      </div>}

      {/* UPGRADE MODAL */}
      {showUpg&&<div className="overlay" onClick={e=>{if(e.target.className==="overlay")setShowUpg(false)}}>
        <div className="modal">
          <div className="upgrade-wrap">
            <div className="upgrade-icon">✦</div>
            <div className="upgrade-title">Upgrade to TradeIQ PRO</div>
            <div className="upgrade-desc">Unlock AI coaching, kill switch enforcement, MT5 sync, and full analytics.</div>
            <div className="upgrade-feats">
              {["AI Coach — strategy-aware trade analysis","Full error detection + root cause fixes","Kill Switch — MT5 enforcement","MT5 & TradingView auto-sync","Prop firm drawdown monitoring","Binance Pay + card payments","Unlimited trade history","Priority support"].map(f=><div key={f} className="ufeat">{f}</div>)}
            </div>
            <div className="upgrade-price">$19<span style={{fontSize:14,fontWeight:400,color:"var(--txt3)"}}>/mo</span></div>
            <div style={{fontSize:11,color:"var(--txt4)",marginBottom:20}}>or $149/yr · 7-day free trial · cancel anytime</div>
            <div className="flex gap2 jc mb3">
              <button className="btn btn-primary" style={{flex:1,padding:"11px"}} onClick={()=>{ alert("Binance Pay + Stripe coming next sprint!"); setShowUpg(false); }}>Pay with Binance Pay</button>
            </div>
            <button className="btn btn-ghost" style={{width:"100%"}} onClick={()=>setShowUpg(false)}>Maybe later</button>
          </div>
        </div>
      </div>}
    </>
  );
}

function AppRoot() {
  const { user, loading } = useAuth();
  if (loading) return <div className="load-page"><span className="spin spin-page"/></div>;
  return user ? <Dashboard/> : <AuthScreen/>;
}

export default function App() {
  return (
    <>
      <style>{CSS}</style>
      <AuthProvider><AppRoot/></AuthProvider>
    </>
  );
}
