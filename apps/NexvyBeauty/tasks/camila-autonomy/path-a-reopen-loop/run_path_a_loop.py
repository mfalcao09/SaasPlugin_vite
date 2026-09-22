#!/usr/bin/env python3
"""Path A reopen — single autonomous loop F0→F6, stop at F7 gate.

Does NOT implement phases by itself. Orchestrates:
  approval gate → per-phase agent brief → verify commands → evidence → advance/escalate.

Usage (after Marcelo approval):
  python3 run_path_a_loop.py --approve-packet
  python3 run_path_a_loop.py --from F0 --until F6
  python3 run_path_a_loop.py --status
  python3 run_path_a_loop.py --approve-f7 --tier 1   # human only
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # tasks/camila-autonomy
REPO_APP = ROOT.parent.parent  # apps/NexvyBeauty if structure: NexvyBeauty/tasks/camila-autonomy
# path: apps/NexvyBeauty/tasks/camila-autonomy/path-a-reopen-loop/thisfile
# parents: 0=path-a-reopen-loop, 1=camila-autonomy, 2=tasks, 3=NexvyBeauty
NEXVY = Path(__file__).resolve().parents[3]
MANIFEST = Path(__file__).resolve().parent / "LOOP-MANIFEST.json"
EVIDENCE = NEXVY / "tasks/camila-autonomy/evidence/PRD-09/path-a-loop"
STATE = EVIDENCE / "loop-state.json"
VERIFY_DIR = Path(__file__).resolve().parent / "verify"
BRIEFS = EVIDENCE / "agent-briefs"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text())


def load_state() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text())
    return {
        "program": "path-a-reopen",
        "status": "idle",
        "current_phase": None,
        "phases": {},
        "updated_at": utc_now(),
    }


def save_state(state: dict) -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = utc_now()
    STATE.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n")


def require_approval(m: dict) -> None:
    if not m.get("approval", {}).get("execute_f0_f6_without_supervision"):
        print(
            "BLOCKED: LOOP-MANIFEST.approval.execute_f0_f6_without_supervision=false\n"
            "Marcelo must approve PRD-10 packet, then:\n"
            "  python3 run_path_a_loop.py --approve-packet",
            file=sys.stderr,
        )
        sys.exit(2)


def set_approved() -> None:
    m = load_manifest()
    m.setdefault("approval", {})
    m["approval"]["execute_f0_f6_without_supervision"] = True
    m["approval"]["status"] = "approved"
    m["approval"]["approved_at"] = utc_now()
    MANIFEST.write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n")
    print("APPROVED: autonomous F0→F6 enabled in LOOP-MANIFEST.json")


def phase_ids(m: dict) -> list[str]:
    return [p["id"] for p in m["phases"]]


def write_brief(phase: dict, attempt: int) -> Path:
    BRIEFS.mkdir(parents=True, exist_ok=True)
    prd_path = NEXVY / "tasks/camila-autonomy" / phase["prd"]
    brief = {
        "type": "PATH_A_PHASE_EXECUTE",
        "phase": phase["id"],
        "attempt": attempt,
        "prd": str(prd_path),
        "sends_allowed": phase.get("sends_allowed"),
        "r2_mode": phase.get("r2_mode", "n/a"),
        "instructions": [
            f"Read and execute PRD {prd_path}",
            "Follow Loop engineering protocol exactly",
            "Do not expand beyond allowlist in manifest",
            "Write evidence JSON under evidence/PRD-09/path-a-loop/",
            "Leave REOPEN/R2 flags off unless phase explicitly requires shadow/enforce on canary",
        ],
        "verify": phase.get("verify", []),
        "created_at": utc_now(),
    }
    out = BRIEFS / f"{phase['id']}-attempt{attempt}-brief.json"
    out.write_text(json.dumps(brief, indent=2, ensure_ascii=False) + "\n")
    # Human+agent readable stub
    md = BRIEFS / f"{phase['id']}-attempt{attempt}-brief.md"
    md.write_text(
        f"# Agent brief {phase['id']} attempt {attempt}\n\n"
        f"Execute PRD: `{prd_path}`\n\n"
        f"Verify: {phase.get('verify')}\n\n"
        f"Sends allowed: `{phase.get('sends_allowed')}`\n",
        encoding="utf-8",
    )
    return out


def run_verify(phase: dict) -> tuple[int, str]:
    """Run verify entries: python scripts in verify/ or shell commands from NEXVY."""
    logs = []
    for item in phase.get("verify", []):
        script = VERIFY_DIR / item
        if script.exists():
            cmd = [sys.executable, str(script)]
        elif item.endswith(".py"):
            # placeholder until verify scripts land in F0 implementation
            stub = VERIFY_DIR / item
            if not stub.exists():
                logs.append(f"MISSING_VERIFY:{item}")
                return 1, "\n".join(logs)
            cmd = [sys.executable, str(stub)]
        else:
            cmd = ["bash", "-lc", item]
        logs.append(f"$ {' '.join(cmd)}")
        try:
            p = subprocess.run(
                cmd,
                cwd=str(NEXVY),
                capture_output=True,
                text=True,
                timeout=3600,
            )
            logs.append(p.stdout[-4000:] if p.stdout else "")
            logs.append(p.stderr[-2000:] if p.stderr else "")
            if p.returncode != 0:
                logs.append(f"EXIT:{p.returncode}")
                return p.returncode, "\n".join(logs)
        except subprocess.TimeoutExpired:
            return 1, "\n".join(logs + ["TIMEOUT"])
    return 0, "\n".join(logs)


def mark_phase(state: dict, pid: str, status: str, detail: dict) -> None:
    state.setdefault("phases", {})[pid] = {
        "status": status,
        "detail": detail,
        "at": utc_now(),
    }
    state["current_phase"] = pid
    state["status"] = status
    save_state(state)


def run_loop(start: str, until: str) -> int:
    m = load_manifest()
    require_approval(m)
    ids = phase_ids(m)
    if start not in ids or until not in ids:
        print("Invalid phase id", file=sys.stderr)
        return 2
    i0, i1 = ids.index(start), ids.index(until)
    state = load_state()
    state["status"] = "running"
    save_state(state)
    EVIDENCE.mkdir(parents=True, exist_ok=True)

    max_attempts = int(m["loop"]["max_attempts_per_phase"])

    for phase in m["phases"][i0 : i1 + 1]:
        pid = phase["id"]
        if pid == "F7" or phase.get("mode") == "human_gate":
            mark_phase(
                state,
                "F7_GATE",
                "waiting_human",
                {"message": "APROVO F7 PATH-A <degrau> required", "autonomous_complete_through": until if until != "F7" else "F6"},
            )
            print("STOP: F7 human gate. Autonomous segment finished.")
            return 0

        # prerequisite: previous phases pass
        for prev in ids[: ids.index(pid)]:
            st = state.get("phases", {}).get(prev, {}).get("status")
            if st != "pass":
                print(f"BLOCKED: prerequisite {prev} status={st}", file=sys.stderr)
                mark_phase(state, pid, "blocked", {"missing": prev})
                return 1

        ok = False
        last_log = ""
        for attempt in range(1, max_attempts + 1):
            brief = write_brief(phase, attempt)
            print(f"=== {pid} attempt {attempt} brief={brief} ===")
            print(
                f"ACTION REQUIRED BY AGENT: execute PRD {phase['prd']} then re-run verify.\n"
                f"Orchestrator will run verify now (expect FAIL until implementation exists)."
            )
            code, last_log = run_verify(phase)
            (EVIDENCE / f"{pid}-verify-attempt{attempt}.log").write_text(last_log, encoding="utf-8")
            if code == 0:
                mark_phase(state, pid, "pass", {"attempt": attempt, "brief": str(brief)})
                ok = True
                break
            mark_phase(state, pid, "retry", {"attempt": attempt, "exit": code})

        if not ok:
            mark_phase(
                state,
                pid,
                "escalated",
                {"attempts": max_attempts, "log_tail": last_log[-1500:]},
            )
            print(f"ESCALATE: phase {pid} failed verification", file=sys.stderr)
            return 1

    # finished autonomous range
    if until != "F7":
        mark_phase(
            state,
            "F7_GATE",
            "waiting_human",
            {"autonomous_complete_through": until},
        )
    print("LOOP_SEGMENT_PASS", until)
    return 0


def approve_f7(tier: int) -> int:
    state = load_state()
    for pid in ["F0", "F1", "F2", "F3", "F4", "F5", "F6"]:
        if state.get("phases", {}).get(pid, {}).get("status") != "pass":
            print(f"NO-GO F7: {pid} not pass", file=sys.stderr)
            return 1
    token = f"APROVO F7 PATH-A tier={tier}"
    state["f7_approval"] = {"token": token, "at": utc_now(), "tier": tier}
    mark_phase(state, "F7", "approved_pending_ramp", {"tier": tier, "token": token})
    print(token)
    print("Next: agent executes F7-EXPANSION.md for this tier only.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--approve-packet", action="store_true")
    ap.add_argument("--from", dest="start", default="F0")
    ap.add_argument("--until", dest="until", default="F6")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--approve-f7", action="store_true")
    ap.add_argument("--tier", type=int, default=1)
    args = ap.parse_args()

    if args.approve_packet:
        set_approved()
        return 0
    if args.status:
        print(json.dumps(load_state(), indent=2, ensure_ascii=False))
        return 0
    if args.approve_f7:
        return approve_f7(args.tier)
    return run_loop(args.start, args.until)


if __name__ == "__main__":
    raise SystemExit(main())
