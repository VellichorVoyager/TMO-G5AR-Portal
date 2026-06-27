# Metameros Network Repository Migration Design

**Status:** Approved design; pending review of this written specification before execution

**Date:** 2026-06-27

## Goal

Convert `VellichorVoyager/TMO-G5AR-Portal` from a GitHub fork into the independent
public repository `VellichorVoyager/metameros-network` while preserving the complete
Git history, retaining upstream attribution, and archiving GitHub metadata that the
detach operation cannot preserve.

## Product identity

- Product name: **Metameros Network**
- Repository slug: `metameros-network`
- Positioning: local-first network security, VPN, Quest, and home-lab command center
- Historical upstream: `rchen14b/TMO-G5AR-Portal`

`metameros-platform` remains separate because it serves Metameros media and cultural
storytelling work.

## Current repository facts

The migration starts from these verified facts:

- The local `main` branch matches `origin/main`.
- The fork is 37 commits ahead of and zero commits behind `upstream/main`.
- The repository is public, approximately 2.6 MB, and has no child forks.
- GitHub therefore makes the **Leave fork network** operation available.
- The repository has 37 pull-request records, including seven open Dependabot pull
  requests.
- The repository has one release, `v0.2.0`, and an enabled wiki surface.
- GitHub reports no branch protection on `main` and no repository Actions variables
  or secrets.
- The upstream README declares MIT licensing, but neither repository contains an
  explicit `LICENSE` file.

## Non-negotiable invariants

1. No fork-network mutation occurs until the Git mirror and metadata archive both
   exist and their checksums are recorded.
2. All Git commits, branches, annotated tags, lightweight tags, and author metadata
   are preserved.
3. Existing commit authorship is never rewritten.
4. The independent repository retains a visible provenance statement linking to the
   original upstream.
5. No credentials, local environment files, router identifiers, or private network
   data enter the archive or repository.
6. `upstream` remains configured as a fetch-only historical reference after the
   migration; new development pushes only to `origin`.
7. Detachment and product rebranding are separate checkpoints. Repository integrity
   is verified before application files are renamed.

## Backup design

Create a timestamped archive outside the working tree containing:

- A bare mirror clone of the fork, including every branch and tag.
- Repository metadata and settings returned by the GitHub API.
- Pull-request metadata, reviews, review comments, issue comments, and patch files.
- Release metadata and all release assets.
- Labels, milestones, topics, environments, Actions settings, and security settings.
- Names of Actions variables and secrets. Secret values are not retrievable and are
  never written to the archive.
- A wiki mirror when the wiki remote contains commits.
- A manifest containing file sizes and SHA-256 checksums for every archive artifact.

The archive is evidence and recovery material. GitHub cannot import it back as native
pull-request discussions after detachment.

## License and attribution design

Before detachment, add:

- A standard MIT `LICENSE` file covering the repository's contributors.
- A `NOTICE.md` stating that Metameros Network began as a fork of
  `rchen14b/TMO-G5AR-Portal`, linking to that source, and distinguishing subsequent
  Metameros development without claiming ownership of prior contributors' work.
- A short provenance section in the README.

The full Git history remains the authoritative authorship record.

## Migration sequence

1. Confirm a clean worktree and successful fetch from both `origin` and `upstream`.
2. Create and verify the external Git mirror and GitHub metadata archive.
3. Commit and push the license and attribution files.
4. Re-run the mirror and metadata export so the archive includes that commit.
5. Record the pre-detachment commit SHA, branch list, tag list, and remote URLs.
6. Use GitHub's **Leave fork network** operation on
   `VellichorVoyager/TMO-G5AR-Portal`.
7. Wait until GitHub reports `isFork=false` and repository operations are available.
8. Rename the standalone repository to `metameros-network`.
9. Change local `origin` to
   `https://github.com/VellichorVoyager/metameros-network.git`.
10. Keep `upstream` pointed to
    `https://github.com/rchen14b/TMO-G5AR-Portal.git` for fetches only.
11. Restore the repository description, topics, release notes/assets, Dependabot,
    Actions permissions, vulnerability reporting, and security-analysis settings.
12. Allow Dependabot to regenerate its open update pull requests against the new
    standalone repository.
13. Verify clone, fetch, push, CI, tags, release downloads, and repository metadata.

## Rebrand checkpoint

After repository integrity passes verification, perform the product rebrand as a
separate reviewed change:

- README title, description, architecture, screenshots, and provenance
- `package.json` package name and description
- Application metadata and visible product title
- Docker image, service, and container names
- Documentation headings and roadmap language
- GitHub description and topics

Compatibility-sensitive environment-variable names and API paths remain unchanged
unless a later feature specification explicitly migrates them.

## Failure handling

- Before detachment: stop immediately if any backup, checksum, fetch, or push check
  fails. The fork remains unchanged.
- During GitHub processing: make no competing repository changes; poll until GitHub
  reports a stable standalone repository.
- After detachment: restore Git content from the mirror if refs are missing. Native
  GitHub pull-request discussions cannot be restored.
- After rename: use GitHub's redirect only as a convenience; explicitly update every
  local and documented remote URL.
- If CI or Dependabot does not reinitialize, restore settings from the exported
  metadata and trigger a clean run on `main`.

## Acceptance criteria

The migration is complete only when all of the following are true:

- `VellichorVoyager/metameros-network` exists and reports `isFork=false`.
- Local `main`, remote `main`, and the recorded pre-detachment SHA are identical.
- All recorded branches and tags are present.
- A fresh clone builds and passes the existing test suite.
- `origin` points to the Metameros repository and `upstream` remains fetch-only.
- The MIT license, upstream notice, and README provenance are visible.
- CI, Dependabot, vulnerability reporting, and security scanning are enabled or their
  availability is documented.
- Release `v0.2.0` is represented with its original tag and restored release notes.
- The external migration archive has a verified checksum manifest.
- No secret or local environment file appears in Git history or the migration archive.

## Out of scope

- Rewriting or squashing historical commits
- Removing upstream attribution
- Restoring pull-request discussions as synthetic GitHub issues
- Implementing the security-operations foundation
- Renaming compatibility-sensitive configuration before a dedicated migration plan
