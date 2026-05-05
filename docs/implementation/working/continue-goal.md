# Continue Goal Instruction

Use this file as the tiny launcher for a fresh Codex session.

Do not trust chat history. Read repo truth first:
- AGENTS.md
- docs/implementation/agent-operating-model.md
- docs/implementation/slice-backlog.yaml
- docs/implementation/system_state.md
- docs/implementation/working/current-plan.md
- docs/implementation/delivery-records/
- docs/implementation/slice-contracts/

Verify the current active slice from files, then continue only if the backlog and repo state make it legal.
If no active slice exists, run `plan-next-slice` and keep going instead of stopping.
Do not stop at workflow handoffs if the next legal command is already clear.
Keep moving through orient, plan, review, build, close, and the next eligible slice until a real blocker, invalid contract, or true completion point is reached.
