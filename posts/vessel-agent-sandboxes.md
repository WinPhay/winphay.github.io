# Time-Traveling Sandboxes for Coding Agents

Giving an autonomous coding agent unrestricted shell access on your workstation eventually leads to one of three failures: leaked `.env` secrets, broken host packages, or polluted `main` branches.

[Vessel](https://github.com/WinPhay/vessel) solves this at the container boundary:

- **Host Shield**: Mounts only `/workspace` with strict cgroup CPU/RAM quotas and optional `--network none` airgapping.
- **Sub-Second Checkpoints**: Snapshot and rollback workspace state (`vessel_checkpoint`, `vessel_rollback`) with zero-dependency Myers delta diffs (`vessel_checkpoint_diff`).
- **DLP Secret Redaction**: Automatically redacts API keys, tokens, and private keys from agent-visible stdout/stderr while injecting real secrets cleanly at runtime.
- **Git Worktree Isolation**: Keeps your primary checkout untouched while agents commit verified work on isolated branches.
