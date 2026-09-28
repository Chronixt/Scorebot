Factoid Bureau Discord Bot

PURPOSE
Maintain scoring for a daily Fact or Fictoid game conducted using EasyPoll.

CORE REQUIREMENTS

1. Integrate with Discord application commands.
2. Read individual voting results from completed EasyPoll polls.
3. Admin can designate the correct poll option.
4. Award 1 point to each user selecting the correct answer.
5. Store individual case results.
6. Prevent duplicate scoring.
7. Allow a scored case to be corrected/recalculated.

COMMANDS

/leaderboard
- Show all-time ranking.

/stats [user]
- Show individual statistics.

/case [number]
- Show results for a particular case.

/importscore [user] [points]
- Admin only.
- Used to import scores from Cases 1-30.

/correct [case] [answer]
- Admin only.
- Recalculate an incorrectly scored case.

MESSAGE CONTEXT COMMAND

"Score Fact or Fictoid"
- Admin only.
- Invoked against an EasyPoll message.
- Ask administrator which poll option is correct.
- Retrieve EasyPoll voters.
- Score case.
- Store results.
- Respond with case summary.

DATABASE

players
cases
answers

Scoring must be idempotent.
(case_id, discord_user_id) must be unique.

HOSTING TARGET

Cloudflare Workers.
Cloudflare D1 database.

Do not implement question creation.
EasyPoll remains responsible for creating and running polls.