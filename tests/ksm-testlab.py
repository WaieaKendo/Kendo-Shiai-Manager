#!/usr/bin/env python3
"""KSM TestLab — deterministic tournament-engine simulation harness.

Runs the actual browser application in headless Chromium and exercises the real
KSM generation, advancement, no-show, queue, tiebreak, and persistence paths.
It is intentionally separate from the production UI.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Callable, Any

from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "public" / "index.html").read_text(encoding="utf-8")
REPORT_DIR = ROOT / "testlab-reports"


@dataclass
class Result:
    category: str
    scenario: str
    status: str
    assertions: int
    duration_ms: int
    detail: str = ""


class Lab:
    def __init__(self, page):
        self.page = page
        self.results: list[Result] = []

    def run(self, category: str, scenario: str, fn: Callable[[], int]) -> None:
        start = time.perf_counter()
        try:
            assertions = int(fn() or 1)
            status, detail = "PASS", ""
        except Exception as exc:  # noqa: BLE001 - report every scenario independently
            assertions = 0
            status, detail = "FAIL", str(exc)
        duration = int((time.perf_counter() - start) * 1000)
        self.results.append(Result(category, scenario, status, assertions, duration, detail))
        glyph = "✓" if status == "PASS" else "✗"
        print(f"{glyph} {category}: {scenario} ({duration} ms){' — ' + detail if detail else ''}")


def reset_individual(page, n: int, fmt: str, court: str, division: str = "Test") -> None:
    page.evaluate(
        """({n,fmt,court,division})=>{
          state.generated=false;
          state.divisions=[division];
          state.divisionTypes={[division]:fmt};
          state.divisionCourts={[division]:court};
          state.competitors=Array.from({length:n},(_,i)=>({
            name:`P${i+1}`,dojo:`D${i+1}`,division,seed:i<4?String(i+1):'',status:'Checked'
          }));
          state.teams=[];state.pools={};state.allMatches={};state.singleElimNodes={};
          state.singleElimComps={};state.teamBracketNodes={};state.teamPools={};
          state.brackets={};state.championshipNodes={};state.byeWinners={};state.currentByDivision={};state.courtState={};
          state.courtActiveDivision={};state.currentDivision=division;state.currentCourt='A';
          generateDivisionState(division);state.generated=true;initCourtStates();
        }""",
        {"n": n, "fmt": fmt, "court": court, "division": division},
    )


def scenario_single_elim_exhaustion(page, n: int, court: str) -> int:
    reset_individual(page, n, "Single Elimination", court)
    initial = page.evaluate("state.allMatches.Test.length")
    page.evaluate(
        """()=>{
          let guard=0;
          while(guard++<500){
            syncIndividualSingleElim('Test',state.allMatches.Test,state.singleElimComps.Test||[]);
            const ready=state.allMatches.Test.filter(m=>m.singleElim&&!m.done&&m.ready);
            if(!ready.length)break;
            ready.forEach(m=>{m.done=true;m.wp=['M'];m.rp=[];});
          }
          syncIndividualSingleElim('Test',state.allMatches.Test,state.singleElimComps.Test||[]);
        }"""
    )
    data = page.evaluate(
        """()=>({
          initial:%d,
          total:state.allMatches.Test.length,
          ids:state.allMatches.Test.filter(m=>m.singleElim).map(m=>m.elimNodeId),
          finals:state.allMatches.Test.filter(m=>m.singleElim&&m.position==='Final'),
          unfinished:state.allMatches.Test.filter(m=>m.singleElim&&m.ready&&!m.done).length,
          nodes:(state.singleElimNodes.Test||[]).length
        })""" % initial
    )
    assert data["total"] == initial, f"Match count changed {initial} → {data['total']}"
    assert len(data["ids"]) == len(set(data["ids"])), "Duplicate elimination node Match Object"
    assert len(data["finals"]) == 1, f"Expected one Final, got {len(data['finals'])}"
    assert data["finals"][0]["done"], "Final did not complete"
    assert data["unfinished"] == 0, f"Ready matches remain: {data['unfinished']}"
    assert len(data["ids"]) == data["nodes"], "Template node / Match Object count mismatch"
    return 6


def scenario_pool_clean_exhaustion(page, n: int, court: str) -> int:
    reset_individual(page, n, "Round Robin", court)
    page.evaluate(
        """()=>{
          let guard=0;
          while(guard++<1000){
            const pending=state.allMatches.Test.filter(m=>!m.done&&!m.championship&&!m.tiebreak);
            if(!pending.length)break;
            pending.forEach(m=>{
              const wi=Number(String(m.white||'').replace(/\\D/g,''))||9999;
              const ri=Number(String(m.red||'').replace(/\\D/g,''))||9999;
              m.done=true;
              if(wi<ri){m.wp=['M'];m.rp=[];}else{m.wp=[];m.rp=['M'];}
              maybeCreateChampionship(m);
            });
          }
          syncChampionshipTemplate('Test');
          guard=0;
          while(guard++<500){
            syncChampionshipTemplate('Test');
            const ready=state.allMatches.Test.filter(m=>m.championship&&!m.done&&individualMatchReady(m));
            if(!ready.length)break;
            ready.forEach(m=>{
              const wi=Number(String(m.white||'').replace(/\\D/g,''))||9999;
              const ri=Number(String(m.red||'').replace(/\\D/g,''))||9999;
              m.done=true;
              if(wi<ri){m.wp=['M'];m.rp=[];}else{m.wp=[];m.rp=['M'];}
              maybeAdvanceChampionship(m);
            });
          }
          syncChampionshipTemplate('Test');
        }"""
    )
    data = page.evaluate(
        """()=>({
          labels:(state.pools.Test||[]).map(p=>p.label),
          baseDone:state.allMatches.Test.filter(m=>!m.championship&&!m.tiebreak).every(m=>m.done),
          finals:state.allMatches.Test.filter(m=>m.championship&&m.position==='Final'),
          duplicateKeys:(()=>{const ks=state.allMatches.Test.filter(m=>m.championship).map(individualLogicalMatchKey);return ks.length-new Set(ks).size})(),
          pendingTB:state.allMatches.Test.some(m=>m.tiebreak&&!m.done)
        })"""
    )
    assert data["labels"] == sorted(data["labels"]), "Pool labels reordered"
    assert data["baseDone"], "Pool schedule did not complete"
    assert len(data["finals"]) == 1, f"Expected one championship Final, got {len(data['finals'])}"
    assert data["finals"][0]["done"], "Championship Final did not complete"
    assert data["duplicateKeys"] == 0, "Duplicate championship Match Objects"
    assert not data["pendingTB"], "Unexpected tiebreak in deterministic no-tie scenario"
    return 6


def scenario_no_show_matrix(page, n: int, court: str) -> int:
    checks = 0
    for removed in range(n):
        reset_individual(page, n, "Round Robin", court)
        before = page.evaluate(
            """()=>state.allMatches.Test.map((m,i)=>({i,pool:m.pool,white:m.white,red:m.red,championship:!!m.championship,key:individualLogicalMatchKey(m)}))"""
        )
        name = f"P{removed+1}"
        applied = page.evaluate("name=>applyIndividualNoShow('Test',name)", name)
        assert applied, f"No-show rejected for {name}"
        after = page.evaluate(
            """()=>({
              pools:state.pools.Test.map(p=>p.label),
              matches:state.allMatches.Test.map(m=>({pool:m.pool,white:m.white,red:m.red,championship:!!m.championship,key:individualLogicalMatchKey(m)}))
            })"""
        )
        assert after["pools"] == sorted(after["pools"]), f"Pool order changed for {name}"
        survivors = [m for m in before if m["championship"] or (m["white"] != name and m["red"] != name)]
        projected = [{k: m[k] for k in ("pool", "white", "red", "championship", "key")} for m in survivors]
        assert after["matches"] == projected, f"Surviving match order changed for {name}"
        checks += 3
    return checks


def scenario_split_queue_order(page, n: int) -> int:
    reset_individual(page, n, "Single Elimination", "split")
    data = page.evaluate(
        """()=>{
          const nodes=state.singleElimNodes.Test||[];
          const arr=state.allMatches.Test||[];
          const byCourt=c=>nodes.filter(n=>(n.round==='Final'?'A':n.court)===c).map(n=>n.id);
          const matchByCourt=c=>arr.filter(m=>m.singleElim&&m.court===c).map(m=>m.elimNodeId);
          return {aNodes:byCourt('A'),bNodes:byCourt('B'),aMatches:matchByCourt('A'),bMatches:matchByCourt('B')};
        }"""
    )
    assert data["aMatches"] == data["aNodes"], f"Court A queue/template order mismatch: {data}"
    assert data["bMatches"] == data["bNodes"], f"Court B queue/template order mismatch: {data}"
    return 2


def scenario_tiebreak_seed_contract(page) -> int:
    # Force the exact first-place and second-place seed ownership contracts.
    return page.evaluate(
        """()=>{
          let count=0;
          const A={name:'A',dojo:'X',wins:2,pts:3},B={name:'B',dojo:'Y',wins:2,pts:3},C={name:'C',dojo:'Z',wins:0,pts:0};
          const oldInitial=initialPoolStandings,oldResolve=resolveTiebreakBaseGroup,oldFinished=poolFinished,oldPending=pendingTiebreak;
          try{
            state.currentDivision='TB';state.brackets={TB:[['A1','A2']]};state.pools={TB:[{label:'A',players:[A,B,C]}]};state.allMatches={TB:[]};
            poolFinished=()=>true;pendingTiebreak=()=>false;initialPoolStandings=()=>[A,B,C];
            resolveTiebreakBaseGroup=()=>({locked:[A,B],unresolved:[],ordered:[A,B]});
            let r=poolSeedResolution('A','TB');
            if(!(r.complete&&r.seeds[1]?.name==='A'&&r.seeds[2]?.name==='B'))throw new Error('Tie for first did not resolve Seeds 1 and 2');count+=3;
            resolveTiebreakBaseGroup=()=>({locked:[A],unresolved:[],ordered:[A,B]});
            r=poolSeedResolution('A','TB');
            if(r.seeds[1]?.name!=='A')throw new Error('Secured Seed 1 changed');count++;
          } finally {initialPoolStandings=oldInitial;resolveTiebreakBaseGroup=oldResolve;poolFinished=oldFinished;pendingTiebreak=oldPending;}
          return count;
        }"""
    )


def scenario_save_load_roundtrip(page) -> int:
    reset_individual(page, 8, "Single Elimination", "split")
    payload = page.evaluate("tournamentPayload()")
    # Mutate then restore through the actual payload loader.
    page.evaluate("state.competitors=[];state.allMatches={};state.singleElimNodes={}")
    page.evaluate("p=>applyTournamentPayload(p,false)", payload)
    data = page.evaluate("()=>({n:state.competitors.length,m:state.allMatches.Test.length,nodes:state.singleElimNodes.Test.length,mode:state.divisionCourts.Test})")
    assert data["n"] == 8, data
    assert data["m"] == data["nodes"], data
    assert data["mode"] == "split", data
    return 3


def run_static_regressions(profile: str) -> list[Result]:
    if profile == "smoke":
        files = ["verify-package.mjs", "template-consistency-seed-resolution-test.mjs"]
    else:
        files = [
            "verify-package.mjs",
            "tournament-management-engine-test.py",
            "tournament-management-sweep-test.py",
            "split-court-stabilization-test.py",
            "split-court-template-consolidation-test.py",
            "bracket-lifecycle-tiebreak-simulation-test.py",
            "match-object-origin-invariant-test.py",
            "seed-locked-tiebreak-test.py",
            "template-consistency-seed-resolution-test.mjs",
        ]
    out: list[Result] = []
    for filename in files:
        path = ROOT / "tests" / filename
        cmd = ["node", str(path)] if path.suffix == ".mjs" else [sys.executable, str(path)]
        start = time.perf_counter()
        proc = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True, timeout=180)
        duration = int((time.perf_counter() - start) * 1000)
        detail = (proc.stdout + proc.stderr).strip().replace("\n", " | ")[-1200:]
        out.append(Result("Maintained regression", filename, "PASS" if proc.returncode == 0 else "FAIL", 1 if proc.returncode == 0 else 0, duration, detail))
        print(("✓" if proc.returncode == 0 else "✗") + f" Maintained regression: {filename} ({duration} ms)")
    return out


def write_reports(results: list[Result], profile: str, seed: int) -> tuple[Path, Path]:
    REPORT_DIR.mkdir(exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    json_path = REPORT_DIR / f"testlab-{stamp}.json"
    md_path = REPORT_DIR / f"testlab-{stamp}.md"
    passed = sum(r.status == "PASS" for r in results)
    failed = len(results) - passed
    assertions = sum(r.assertions for r in results)
    payload = {"profile": profile, "seed": seed, "passed": passed, "failed": failed, "assertions": assertions, "results": [asdict(r) for r in results]}
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    lines = [
        "# KSM TestLab Report",
        "",
        f"- Profile: **{profile}**",
        f"- Seed: **{seed}**",
        f"- Scenarios: **{len(results)}**",
        f"- Passed: **{passed}**",
        f"- Failed: **{failed}**",
        f"- Assertions: **{assertions}**",
        "",
        "| Category | Scenario | Status | Assertions | Time |",
        "|---|---|---:|---:|---:|",
    ]
    for r in results:
        lines.append(f"| {r.category} | {r.scenario} | {r.status} | {r.assertions} | {r.duration_ms} ms |")
    failures = [r for r in results if r.status == "FAIL"]
    if failures:
        lines += ["", "## Failures", ""]
        for r in failures:
            lines += [f"### {r.category}: {r.scenario}", "", "```text", r.detail, "```", ""]
    md_path.write_text("\n".join(lines), encoding="utf-8")
    return json_path, md_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Run KSM deterministic simulation TestLab")
    parser.add_argument("--profile", choices=("smoke", "standard", "exhaustive"), default="standard")
    parser.add_argument("--seed", type=int, default=3127)
    parser.add_argument("--skip-regressions", action="store_true")
    args = parser.parse_args()

    results: list[Result] = []
    if not args.skip_regressions:
        results.extend(run_static_regressions(args.profile))

    errors: list[str] = []
    with sync_playwright() as p:
        browser = launch_chromium(p)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        load_app(page, HTML)
        lab = Lab(page)

        elim_counts = [4, 8, 11, 16] if args.profile == "smoke" else list(range(4, 33))
        pool_counts = [6, 8, 11] if args.profile == "smoke" else list(range(6, 33))
        no_show_counts = [6, 7, 11] if args.profile != "exhaustive" else list(range(6, 23))

        for n in elim_counts:
            for court in ("A", "split"):
                lab.run("Individual elimination", f"{n} competitors / {court}", lambda n=n, court=court: scenario_single_elim_exhaustion(page, n, court))
            if n >= 4:
                lab.run("Split queue order", f"{n} competitors", lambda n=n: scenario_split_queue_order(page, n))

        for n in pool_counts:
            for court in (("A", "split") if n >= 6 else ("A",)):
                lab.run("Individual pool exhaustion", f"{n} competitors / {court}", lambda n=n, court=court: scenario_pool_clean_exhaustion(page, n, court))

        for n in no_show_counts:
            lab.run("No-show matrix", f"{n} competitors / single court", lambda n=n: scenario_no_show_matrix(page, n, "A"))
            lab.run("No-show matrix", f"{n} competitors / split courts", lambda n=n: scenario_no_show_matrix(page, n, "split"))

        lab.run("Tiebreak contract", "Seed 1 and Seed 2 ownership", lambda: scenario_tiebreak_seed_contract(page))
        lab.run("Persistence", "Split bracket payload round-trip", lambda: scenario_save_load_roundtrip(page))

        if errors:
            lab.results.append(Result("Browser", "Unhandled page errors", "FAIL", 0, 0, " | ".join(errors)))

        results.extend(lab.results)
        browser.close()

    json_path, md_path = write_reports(results, args.profile, args.seed)
    passed = sum(r.status == "PASS" for r in results)
    failed = len(results) - passed
    assertions = sum(r.assertions for r in results)
    print("\n=== KSM TestLab Summary ===")
    print(f"Profile: {args.profile}")
    print(f"Scenarios: {len(results)} | Passed: {passed} | Failed: {failed} | Assertions: {assertions}")
    print(f"Markdown report: {md_path}")
    print(f"JSON report: {json_path}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
