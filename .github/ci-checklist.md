# CI Checklist

Run this before opening a PR:

- Backend unit tests: `python -m unittest discover -s tests -p "test_*.py" -v` (from `backend/`)
- Frontend lint: `npm run lint` (from `frontend/`)
- Frontend typecheck: `npx tsc -p tsconfig.json --noEmit` (from `frontend/`)
- Frontend build: `npm run build` (from `frontend/`)

If a check fails because of unrelated existing debt, note it in the PR description and scope your fix to touched files unless directed otherwise.
