# Ditto Agentic Dating Simulator

Ditto is an agentic matching prototype: users can define or choose a persona, scan a candidate pool, and run simulated dates before deciding who is worth meeting.

Production matching cannot deep-simulate every possible pair. The core design is a three-layer retrieval and ranking pipeline:

## L1: Coarse Filter

Goal: reduce a very large pool, for example 120,000 profiles, to about 100 plausible candidates per user in milliseconds.

Production implementation:
- Embed each profile with a cheap embedding model.
- Store vectors in pgvector, Pinecone, or another ANN index.
- Apply hard filters first: gender preference, age range, location, deal-breaker rules, safety blocks.
- Retrieve top candidates by cosine similarity plus lightweight business rules.

Prototype implementation:
- `backend/app/pipeline/l1_coarse.py`
- Uses deterministic affinity vectors as an embedding stand-in.
- Keeps the same interface so real embeddings can replace it cleanly.

## L2: Medium Filter

Goal: reduce the L1 candidates to around 10 people using cheap behavioral evidence.

Production implementation:
- Run one lightweight scenario per pair, typically a first-date setup.
- Simulate 3 to 5 turns with a cheap model.
- Repeat the quick date a few times to avoid overfitting to one random opening.
- Score with a cheap judge or heuristic interaction model.

Prototype implementation:
- `backend/app/pipeline/l2_medium.py`
- Runs 3 short first-date simulations per candidate.
- Uses varied openings and a deterministic interaction scorer.
- The home-page Agentic Scout uses this path to return the top 3 candidates.

## L3: Deep Ranking

Goal: spend expensive models only on the tiny set that deserves it.

Production implementation:
- Take the top 10 candidates from L2.
- Run the full simulation suite: 4 high-signal scenarios x 7 loops per scenario.
- Judge each transcript with two stronger judges:
  - GPT-5.5 for chemistry and conversational spark.
  - Claude Opus 4.7 for values and long-term compatibility.
- Aggregate raw score, interest signal, confidence, scenario breakdowns, and action tips.

Prototype implementation:
- `backend/app/pipeline/l3_deep.py`
- Full manual simulation runs 4 scenarios x 7 loops.
- The result page exposes transcripts, judge verdicts, scenario scores, candidate leads, and interest-lift suggestions.

## Why This Architecture Matters

A naive demo can run deep simulations for one pair, but a real dating product needs cost-aware ranking. The important product insight is that the expensive agentic behavior belongs at the end of the funnel:

1. L1 makes the search space tractable.
2. L2 gathers lightweight behavioral evidence.
3. L3 performs deep, human-readable simulations only where it can change the recommendation.

This is how Ditto can feel agentic to users without becoming economically impossible in production.

## Current Demo Flow

1. Choose or custom-fill Person A.
2. Click `Find Top 3 With Auto-Date`.
3. Ditto runs L1 + L2 and returns three candidate matches with scores and behavior tips.
4. Pick a candidate or click `Simulate`.
5. L3 runs 4 scenarios x 7 loops, then returns the compatibility report.
