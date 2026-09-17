#!/usr/bin/env python3
"""Path A F6 live canary R2 — ONLY 5511945760964. Finally OFF+kill."""
from __future__ import annotations
import argparse, json, os, subprocess, sys, time, uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib import request, error

CANARY="5511945760964"
AGENT_ID="68aeece9-26f2-4f7b-a595-a6ea5e8acfa7"
INSTANCE_UUID="80268751-958e-4750-8550-eeae942b3c4d"
INSTANCE_ID="3F8520044B4222D5DB40D226F545789F"
PRODUCT_ID="806b5975-e268-402e-a65c-9e9503271041"
LEAD_ID="84f142a0-8e57-433e-b235-723b58178d7a"
NEXVY=Path(__file__).resolve().parents[3]
EVID=Path(__file__).resolve().parents[1]/"evidence/PRD-09/path-a-loop"

def load_dotenv():
    out={}
    for name in (".env.local",".env"):
        fp=NEXVY/name
        if not fp.exists(): continue
        for line in fp.read_text().splitlines():
            if not line or line.startswith("#") or "=" not in line: continue
            k,v=line.split("=",1); out[k.strip()]=v.strip().strip('"').strip("'")
    return out

def db_query(sql):
    r=subprocess.run(["supabase","db","query","--linked",sql],cwd=str(NEXVY),capture_output=True,text=True)
    blob=r.stdout+r.stderr; depth=0; start=None; best=None
    for i,ch in enumerate(blob):
        if ch=="{": 
            if depth==0: start=i
            depth+=1
        elif ch=="}": 
            depth-=1
            if depth==0 and start is not None:
                chunk=blob[start:i+1]
                if '"rows"' in chunk:
                    try: best=json.loads(chunk)
                    except: pass
    if r.returncode!=0 and not best: raise RuntimeError(blob[-800:])
    return list((best or {}).get("rows") or [])

def ensure_off_kill():
    db_query(f"update platform_crm_agent_release_controls set release_state='OFF', kill_switch=true, updated_at=now() where agent_id='{AGENT_ID}'")

def set_test_window():
    db_query(f"update platform_crm_agent_release_controls set release_state='TEST', kill_switch=false, updated_at=now() where agent_id='{AGENT_ID}'")

def seed_bot_active():
    db_query(f"""update platform_crm_conversations set status='bot_active', metadata=coalesce(metadata,'{{}}'::jsonb)-'do_not_contact'-'do_not_contact_reason'-'last_r2_delivered_at'-'last_r2_action_id'-'soft_opt_out_active'-'cold_suppressed'||jsonb_build_object('path_a_f6_seed',true,'remarketing',false), updated_at=now() where wa_qr_instance_id='{INSTANCE_UUID}' and regexp_replace(coalesce(visitor_phone,''), '\\D', '', 'g') like '%945760964%'""")
    db_query(f"delete from platform_crm_lead_optout where product_id='{PRODUCT_ID}' and telefone like '%945760964%'")

def seed_closed_r2():
    ts=datetime.now(timezone.utc).isoformat()
    db_query(f"""update platform_crm_conversations set status='closed', metadata=coalesce(metadata,'{{}}'::jsonb)||jsonb_build_object('do_not_contact',true,'soft_opt_out_active',true,'cold_suppressed',true,'remarketing',true,'last_r2_delivered_at','{ts}'), updated_at=now() where wa_qr_instance_id='{INSTANCE_UUID}' and regexp_replace(coalesce(visitor_phone,''), '\\D', '', 'g') like '%945760964%'""")

def instance_token():
    rows=db_query(f"select instance_token from platform_crm_wa_qr_instances where id='{INSTANCE_UUID}'")
    tok=str((rows[0] or {}).get('instance_token') or '').strip()
    if not tok: raise RuntimeError('no instance_token')
    return tok

def post_inbound(text, env, message_id=None):
    tok=instance_token(); base=(env.get('SUPABASE_URL') or env.get('VITE_SUPABASE_URL') or 'https://fzhlbwhdejumkyqosuvq.supabase.co').rstrip('/')
    url=f"{base}/functions/v1/platform-whatsapp-qr-webhook?provider=zapi&iid={INSTANCE_ID}&tok={tok}&skip_brain=1"
    mid=message_id or f"f6-{uuid.uuid4().hex[:16]}"
    body={"type":"ReceivedCallback","instanceId":INSTANCE_ID,"phone":CANARY,"fromMe":False,"messageId":mid,"text":{"message":text},"senderName":"wa-eval-f6"}
    req=request.Request(url,data=json.dumps(body).encode(),headers={"Content-Type":"application/json"},method="POST")
    try:
        with request.urlopen(req,timeout=90) as resp:
            raw=resp.read().decode(); return {"http":resp.status,"body":json.loads(raw) if raw else {},"messageId":mid}
    except error.HTTPError as e:
        return {"http":e.code,"body":e.read().decode()[:500],"messageId":mid}

def count_r2():
    rows=db_query(f"""select count(*)::int as n from platform_crm_messages m join platform_crm_conversations c on c.id=m.conversation_id where c.wa_qr_instance_id='{INSTANCE_UUID}' and regexp_replace(coalesce(c.visitor_phone,''), '\\D', '', 'g') like '%945760964%' and m.direction='outbound' and coalesce(m.metadata->>'path_a_r2','false')='true' and m.created_at > now() - interval '20 minutes'""")
    return int((rows[0] or {}).get('n') or 0)

def count_out_since(iso):
    rows=db_query(f"""select count(*)::int as n from platform_crm_messages m join platform_crm_conversations c on c.id=m.conversation_id where c.wa_qr_instance_id='{INSTANCE_UUID}' and regexp_replace(coalesce(c.visitor_phone,''), '\\D', '', 'g') like '%945760964%' and m.direction='outbound' and m.created_at > '{iso}'::timestamptz""")
    return int((rows[0] or {}).get('n') or 0)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--live',action='store_true'); args=ap.parse_args()
    out={"schema":1,"job":"path-a-f6-canary-r2","when":datetime.now(timezone.utc).isoformat(),"canary_phone":CANARY,"live":bool(args.live)}
    EVID.mkdir(parents=True,exist_ok=True); steps={}
    if not args.live:
        out.update(status='dry_skipped',note='--live + PATH_A_F6_LIVE=1'); (EVID/'F6-live-skip.json').write_text(json.dumps(out,indent=2)+'\n'); print(json.dumps(out)); return 0
    if os.environ.get('PATH_A_F6_LIVE','').strip()!='1':
        out.update(status='blocked',note='PATH_A_F6_LIVE!=1'); (EVID/'F6-live-blocked.json').write_text(json.dumps(out,indent=2)+'\n'); print(json.dumps(out),file=sys.stderr); return 2
    env=load_dotenv(); checks={"soft_r2_delivered":0,"hard_r2":0,"farewell_after_r2_outbound":0,"replay_extra_r2":0}
    try:
        ensure_off_kill(); seed_bot_active(); set_test_window(); steps['seed']=True
        before=count_r2(); soft_mid=f"f6-soft-{uuid.uuid4().hex[:12]}"
        steps['soft']=post_inbound('Não tenho interesse agora',env,soft_mid); time.sleep(6)
        delta=count_r2()-before; checks['soft_r2_delivered']=delta
        if delta<1 or delta>2: raise AssertionError(f'soft r2 delta={delta}')
        steps['replay']=post_inbound('Não tenho interesse agora',env,soft_mid); time.sleep(4)
        replay=count_r2()-before-delta; checks['replay_extra_r2']=replay
        if replay!=0: raise AssertionError(f'replay extra r2={replay}')
        seed_bot_active(); set_test_window(); hb=count_r2(); steps['hard']=post_inbound('SAIR',env); time.sleep(5)
        hd=count_r2()-hb; checks['hard_r2']=hd
        if hd!=0: raise AssertionError(f'hard r2={hd}')
        seed_closed_r2(); t0=datetime.now(timezone.utc).isoformat(); steps['farewell']=post_inbound('Pode deixar',env); time.sleep(4)
        fo=count_out_since(t0); checks['farewell_after_r2_outbound']=fo
        if fo!=0: raise AssertionError(f'farewell outbound={fo}')
        out.update(status='pass_live',steps=steps,checks=checks); return 0
    except Exception as e:
        out.update(status='fail_live',error=str(e),steps=steps,checks=checks); print(json.dumps(out),file=sys.stderr); return 1
    finally:
        try:
            ensure_off_kill(); seed_closed_r2()
            out['finally']={'release':db_query(f"select release_state,kill_switch from platform_crm_agent_release_controls where agent_id='{AGENT_ID}'")}
        except Exception as fe: out['finally_error']=str(fe)
        (EVID/'F6-result.json').write_text(json.dumps(out,indent=2,default=str)+'\n')
        (EVID/'F6-live-result-latest.json').write_text(json.dumps(out,indent=2,default=str)+'\n')
        if out.get('status')=='pass_live': print(json.dumps({'status':'pass_live','checks':out.get('checks')}))
if __name__=='__main__': raise SystemExit(main())
