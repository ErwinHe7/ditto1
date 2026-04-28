import asyncio
import json
import sys
import os
import time

sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv()

from app.models import Profile
from app.pipeline.l3_deep import run_l3_deep_match

def load_profiles():
    with open(os.path.join(os.path.dirname(__file__), "sample_profiles.json")) as f:
        return [Profile(**p) for p in json.load(f)]

async def main():
    profiles = load_profiles()
    maya, jordan = profiles[0], profiles[1]

    n = int(os.getenv("N_SIMULATIONS_PER_SCENARIO", "3"))
    print(f"\n{'='*60}")
    print(f"  Ditto Agentic Match: {maya.name} x {jordan.name}")
    print(f"  Simulations per scenario: {n}")
    print(f"{'='*60}\n")

    start = time.time()

    def progress(msg):
        elapsed = time.time() - start
        print(f"  [{elapsed:.0f}s] {msg}")

    report = await run_l3_deep_match(maya, jordan, n_sims=n, on_progress=progress)

    elapsed = time.time() - start
    print(f"\n{'='*60}")
    print(f"  RESULTS ({elapsed:.0f}s total)")
    print(f"{'='*60}")
    print(f"  Overall Score:    {report.overall_score}/100")
    print(f"  Confidence:       {report.confidence}")
    print(f"  Recommendation:   {report.recommendation}")
    print(f"\n  Summary: {report.summary}")

    print(f"\n  --- Per Scenario ---")
    for sr in report.scenario_results:
        print(f"\n  {sr.scenario_name}: avg {sr.avg_score:.1f}")
        # show one sample transcript
        if sr.transcripts:
            print(f"    Sample conversation:")
            for m in sr.transcripts[0][:4]:
                speaker = m["speaker"]
                print(f"      {speaker}: {m['text'][:120]}")

    # save full report
    out = os.path.join(os.path.dirname(__file__), "demo_report.json")
    with open(out, "w") as f:
        f.write(report.model_dump_json(indent=2))
    print(f"\n  Full report saved to {out}")

if __name__ == "__main__":
    asyncio.run(main())
