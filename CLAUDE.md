# claude-flow-patch

Runtime patches for `@claude-flow/cli` **v3.1.0-alpha.40**, `ruvector`, and `ruv-swarm` **v1.0.20**.

**All project instructions, defect workflows, and policies are in [README.md](README.md).**
Read it before making any changes.

## Key Rules

- NEVER modify files inside the npm/npx cache directly -- edit `fix.py` scripts in `patch/`
- NEVER run individual `fix.py` files standalone -- always use `bash patch-all.sh`
- ALWAYS verify with `bash check-patches.sh` after applying
- Patch order matters: NS-001 before NS-002 before NS-003
- Always say **GitHub issue** for upstream references, never bare "issue"
- Use **defect** for the tracked problem, **patch** for the code change
