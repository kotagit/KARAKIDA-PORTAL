# Repo workflow notes

## Always merge feature branches into `main`

Firebase Hosting auto-deploys only on push to `main`
(`.github/workflows/firebase-hosting-merge.yml`).
So every change must end up on `main` — feature-branch pushes do not deploy.

Standard flow for any task:

1. Develop and commit on the designated feature branch.
2. Push the feature branch.
3. `git checkout main && git pull origin main`
   - If `main` and `origin/main` have diverged due to upstream force-update,
     `git reset --hard origin/main`.
4. `git merge --no-ff <feature-branch> -m "<message>"`
5. `git push origin main`

Do not skip the merge step. Always do it as part of completing the task.
