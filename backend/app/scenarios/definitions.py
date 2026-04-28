SCENARIOS = [
    {
        "id": "first_coffee",
        "name": "First coffee date",
        "description": "Both meet at a café for the first time. Awkward but curious.",
        "opener_prompt": (
            "You're meeting in person for the first time at a coffee shop on a Saturday afternoon. "
            "You arrived 2 minutes ago. Start naturally — small talk, observation, anything human."
        ),
        "max_turns": 4,
    },
    {
        "id": "late_night_vulnerable",
        "name": "3am vulnerable conversation",
        "description": "You've been texting for 2 weeks. It's 2am, one shares something real.",
        "opener_prompt": (
            "It's 2am. You've been texting back and forth tonight. "
            "One of you is going to share something real — a fear, a regret, a memory that still hurts. "
            "Let it unfold honestly."
        ),
        "max_turns": 5,
    },
    {
        "id": "minor_conflict",
        "name": "Disagreement on values",
        "description": "A casual conversation reveals a real difference in opinion.",
        "opener_prompt": (
            "You're discussing something casual that turns into a real disagreement — could be about money, "
            "career ambition, family, politics, or how to spend a weekend. "
            "Both of you actually care about this. Don't fake-agree."
        ),
        "max_turns": 4,
    },
    {
        "id": "travel_planning",
        "name": "Planning a trip together",
        "description": "Light, decision-making, reveals priorities and flexibility.",
        "opener_prompt": (
            "You're planning a 4-day trip together for next month. Budget is tight. "
            "Decide where to go, what to do, where to stay. Be honest about preferences."
        ),
        "max_turns": 4,
    },
    {
        "id": "meet_friends",
        "name": "Group setting with friends",
        "description": "Tests social compatibility, banter, side dynamics.",
        "opener_prompt": (
            "You're at a small group dinner with 2 of friend A's closest friends. "
            "Friend A is showing you off a little. The friends are curious but warm. "
            "How do you handle it together? Banter, side comments, eye contact welcome."
        ),
        "max_turns": 5,
    },
    {
        "id": "support_under_stress",
        "name": "One person is having a hard day",
        "description": "Tests emotional attunement and support style.",
        "opener_prompt": (
            "One of you had a genuinely hard day — work disaster, family stress, or grief. "
            "You're seeing each other tonight. Show how you support / are supported. No advice unless asked."
        ),
        "max_turns": 4,
    },
]
