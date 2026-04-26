# Attachment Design

This document describes the current attachment design for confessions, including the data model, workflow ordering, invariants, assumptions, and intentional limitations.

It is intentionally opinionated. Future maintainers should treat the rules in this file as design constraints unless the attachment pipeline is being deliberately reworked.

## Problem Statement

Discord modal uploads are received as ephemeral CDN attachments. Those URLs are signed and expire. The old implementation persisted the modal attachment metadata and reused the original CDN URL later for moderator logs, approvals, resends, and public confession embeds.

That old design was flawed because the attachment artifact could silently disappear after the Discord CDN TTL elapsed. Existing confession records could still point to an attachment row, but the underlying file was no longer durably available.

The current design fixes that by upgrading the modal attachment into a durable Discord attachment before any public attachment rendering depends on it.

## High-Level Architecture

The active flow is:

1. The modal submit handler resolves the optional upload from `resolved.attachments`, performs cheap synchronous permission checks, and emits the `discord/confession.submit` Inngest event.
2. `process-confession-submission` validates channel state and persists the confession.
3. If present, the original modal attachment is persisted in `ephemeral_attachment`.
4. If the confession has an attachment, `process-confession-submission` downloads the original ephemeral CDN URL.
5. `process-confession-submission` creates the moderator log message and uploads the file directly into that message.
6. Discord returns a `Message` payload for the moderator log message.
7. `process-confession-submission` attempts to extract durable attachment metadata from that returned message.
8. When durable metadata is found, it is persisted in `durable_attachment`.
9. When a durable row was persisted, `ephemeral_attachment.durable_attachment_id` is updated to point at it.
10. If the confession is already approved, `process-confession-submission` posts the public confession using the durable attachment URL.
11. If approval is required, the approval interaction later reads the durable attachment synchronously, updates the moderator log message, and only then emits `discord/confession.approve` for the later public dispatch.
12. Resend also reads from the durable attachment only; it does not redownload or reupload the file.

The key design point is that the moderator log message is the persistence anchor for the file artifact.

## Data Model

### `ephemeral_attachment`

This table stores the original modal attachment metadata exactly as received from Discord, including the signed ephemeral CDN URL.

It represents the source upload, not the stable render target.

Important properties:

- The URL may expire.
- The file may become unavailable.
- Query parameters must be preserved while the file is still being downloaded.
- The row exists even if the durable upgrade has not happened yet.

### `durable_attachment`

This table stores the attachment returned by Discord after the file has been uploaded into the moderator log message.

Important properties:

- The file is anchored to a Discord message that moderators can inspect and download from.
- The URL is normalized before persistence.
- The stored URL is the bare CDN URL without the ephemeral query string.
- This row is the source of truth for all post-log attachment rendering.

Persisted fields include:

- Discord attachment ID
- moderator log message ID
- moderator log channel ID
- filename
- content type
- normalized URL
- normalized proxy URL
- image height
- image width

### Why the Durable Row is Separate

The current schema intentionally does not overwrite `ephemeral_attachment.url` or
`ephemeral_attachment.proxy_url` with the durable values.

That separation exists for a reason:

- `ephemeral_attachment` preserves the original modal-upload metadata exactly as received from Discord
- `durable_attachment` records the later moderator-log-backed artifact that was created from it
- `ephemeral_attachment.durable_attachment_id` explicitly encodes the lifecycle transition from
  temporary upload to durable upload

If the durable values were written back into `ephemeral_attachment` in place, the system would lose
the distinction between:

- the original temporary upload token
- the later durable artifact
- whether the durable upgrade actually happened

Keeping these records separate makes legacy-data handling, failure analysis, and attachment lifecycle
invariants much easier to reason about.

### Relationship

The relationship is:

`ephemeral_attachment -> zero-or-one durable_attachment`

This is encoded via `ephemeral_attachment.durable_attachment_id`.

Interpretation:

- `NULL` means the modal upload has not been durably upgraded.
- non-`NULL` means the modal upload has been upgraded and all later reads must use the durable row.

This relationship is intentionally one-directional. The system models the fact that a modal upload is the original artifact and may later be upgraded to a durable artifact.

## Workflow Invariants

These invariants are fundamental to the current design.

### Invariant 1: Ephemeral URLs are process-time only

The original modal attachment URL must only be used while `process-confession-submission` is performing the one-time durable upgrade.

It must not be used later for:

- public confession embeds
- resend flows
- approval flows
- moderator review flows after durable persistence

### Invariant 2: Durable URLs are render-time only

Once a durable attachment exists, all user-visible rendering must read from `durable_attachment`.

This includes:

- public confession messages
- resend operations
- approval/rejection moderation views
- any later moderator-facing attachment display that needs a stable file URL

### Invariant 3: Attachments are single-file

The current confession system assumes exactly one attachment per confession.

This assumption is enforced by using `assertOptional` for:

- the modal upload values
- the returned `message.attachments` array from the moderator log upload

If multi-file support is ever introduced, this document becomes partially invalid and the schema, payload builders, and moderation UI will all need to change.

### Invariant 4: Log first, then durable persistence, then public dispatch

The order of operations matters:

1. create the moderator log message
2. extract and persist the durable attachment
3. link the durable attachment from the ephemeral row
4. dispatch the public confession message

This ordering ensures the public message never renders an attachment URL that was not durably persisted first.

### Invariant 5: Moderator log existence implies durable attachment feasibility

For confessions that contain attachments, approval and resend assume that a moderator log message was already created successfully.

In the current design, `process-confession-submission` attempts to extract a durable attachment from either:

- `message.attachments[0]`, or
- `message.embeds[0].image`

If neither shape is present, the log step still completes, but no durable row is persisted or linked.

Because of that, approval and resend treat a missing durable attachment on an attachment-bearing confession as an unsupported row shape, not as a normal modern-path outcome.

### Invariant 6: Durable extraction depends on Discord's returned message shape

The durable attachment is not always returned by Discord in the same field.

Current observed behavior:

- non-image uploads return the durable attachment in `message.attachments`
- image uploads rendered through the moderator log embed may instead surface the durable URL in
  `message.embeds[n].image`

Because of that, the durable extraction step must branch on the attachment kind instead of assuming
that `message.attachments` always contains the uploaded file.

## URL Handling Rules

URL handling is intentionally asymmetric.

### Ephemeral URLs

Ephemeral URLs are stored with their full query string intact.

Rules:

- Do not strip query parameters before the initial download.
- Do not normalize them into a bare CDN path.
- Treat them as temporary download tokens.

### Durable URLs

Durable URLs are normalized before they are persisted.

Rules:

- Use the built-in `URL` constructor.
- Clear `.search`.
- Persist the normalized URL and proxy URL.

Reason:

Durable Discord attachment URLs should be stored without ephemeral query parameters so later rendering can rely on the stable attachment path shape.

## Discord Response Nuance

Discord's returned `Message` payload for the moderator log upload is not uniform across attachment
types.

### Non-image Uploads

For non-image uploads, the durable metadata is extracted from `message.attachments`.

This is the straightforward case and matches the original assumption behind the durable upload flow.

### Image Uploads

For image uploads rendered in the moderator log embed, Discord may expose the uploaded image through
the returned embed image instead of the returned attachment array.

In practice, this means:

- the moderator log message is created successfully
- `message.attachments` may be empty or absent
- `message.embeds[0].image.url` contains the durable CDN URL
- `message.embeds[0].image.proxy_url` contains the durable proxy URL

The current implementation therefore extracts image durability metadata from the returned embed image
and non-image durability metadata from the returned attachment array.

### Consequence for Log Rendering

The moderator log payload is allowed to render image uploads through the embed image path because the
durable extraction logic now understands that Discord may place the returned durable URL there.

Public confession messages remain simpler:

- once the durable URL is already known, public image rendering just uses that durable URL directly
- there is no need for `attachment://...` indirection outside the initial log upload step

## Active Runtime Flow

### Fresh confession without Attachment

1. Emit `discord/confession.submit`.
2. `process-confession-submission` inserts the confession.
3. `process-confession-submission` creates the moderator log message.
4. If already approved, `process-confession-submission` posts the public confession.
5. No durable attachment row is involved.

### Fresh confession with Attachment

1. Emit `discord/confession.submit`.
2. `process-confession-submission` inserts the confession.
3. `process-confession-submission` inserts the original modal attachment into `ephemeral_attachment`.
4. `process-confession-submission` fetches the confession and original attachment metadata.
5. `process-confession-submission` downloads the ephemeral file from the signed CDN URL.
6. `process-confession-submission` uploads that file as part of the moderator log message.
7. Discord returns the created moderator log message.
8. `process-confession-submission` extracts the durable metadata from `message.attachments` for non-images or
   `message.embeds[*].image` for images.
9. `process-confession-submission` persists the durable row.
10. `process-confession-submission` links `ephemeral_attachment.durable_attachment_id`.
11. If approved, `process-confession-submission` posts the public confession using the durable URL.

### Approval-required Confession with Attachment

1. The confession still goes through `process-confession-submission`.
2. The durable upload still happens before the moderator review message exists.
3. The approval interaction later reads `ephemeral_attachment -> durable_attachment`.
4. The approval interaction updates the moderator log message from the durable attachment data and rejects the action if no durable row is linked.
5. The later public dispatch triggered by `discord/confession.approve` also reads the durable attachment.

Approval does not redownload the original ephemeral attachment. That work is already complete by the time approval is possible.

### Resend

Resend does not redownload or reupload the attachment.

Instead, resend:

1. validates that the confession exists
2. validates that it was already approved
3. validates that the log channel still exists
4. validates that the moderator has `ATTACH_FILES` when the confession has an attachment
5. emits `discord/confession.resend` so the resend path takes over

The resend path reads from the durable attachment only.

## Moderator Log Message Behavior

The durable file artifact is intentionally tied to the moderator log message.

This means:

- the moderator log message is not just an audit record
- it is also the storage anchor for the durable Discord attachment

This is a deliberate simplification. The system does not maintain a separate durable storage provider or an abstract file service.

### Why This is Acceptable

- moderator log messages are rarely deleted in practice
- the simpler design keeps the migration small and reviewable
- Discord already provides the durable attachment object we need after message creation

More precisely:

- for non-images, Discord exposes the durable artifact in the returned attachment array
- for images, Discord may expose the durable artifact through the returned embed image instead

### Consequence

If a moderator log message containing the file is deleted later, the durable attachment may eventually stop being a reliable artifact. The current system does not attempt to recover from that.

## Inngest Design Decisions

The attachment architecture spans both interaction ingress and Inngest workers.

Important choices:

- modal submit resolves the optional upload and emits `discord/confession.submit`
- function: `process-confession-submission`

For resend:

- event: `discord/confession.resend`
- function: `process-confession-resend`

For approval:

- the approval interaction synchronously reads durable attachment state and updates the moderator log message
- event: `discord/confession.approve`
- function: `dispatch-approval`

The transport layer is intentionally thin for submit and resend. Approval remains a synchronous exception path with an async post-dispatch worker.

All Discord-originated attachment-related events are deduplicated at ingest with `event.id = interactionId`, and they also preserve the original Discord interaction time through the overridden Inngest event timestamp.

## Legacy Data Behavior

Historical rows are not backfilled.

That is an explicit product decision.

### Legacy Confession without Attachment

This remains fully supported.

### Legacy Confession with Durable Attachment Already Linked

This remains fully supported.

### Legacy Confession with Only an Ephemeral Attachment

This is intentionally unsupported for resend and approval.

The original file may already be gone from the Discord CDN, and the current system does not attempt to repair or rehydrate those rows. In practice, approval and resend reject any attachment-bearing confession whose `ephemeral_attachment` row does not have a linked `durable_attachment` row.

Current moderator-facing behavior:

- `/resend` returns a recoverable message explaining that the legacy attachment is no longer available in the Discord CDN
- approval/rejection returns a recoverable message explaining the same limitation

This is preferable to crashing on an assertion, but it is still a hard product limitation.

## Error Handling Philosophy

The current implementation intentionally avoids broad recovery machinery.

This was a deliberate choice made during the durable-attachment migration.

### What the System Does Do

- asserts core invariants in internal code paths
- returns moderator-friendly recoverable errors for known legacy-data edge cases in interaction handlers
- lets Inngest retry ordinary background failures
- allows durable upload failures to land in the Inngest DLQ
- sends an ephemeral approval follow-up if the approval transaction succeeds but the later public dispatch fails with Discord channel/access/permission errors

### What the System Does Not Do

- no historical backfill
- no automatic repair job for legacy rows
- no fallback storage backend
- no retry orchestration beyond normal Inngest behavior
- no cross-system reconciliation if moderator log messages are deleted later
- no compensating transactions for partially completed durable upgrade attempts

This is intentional. Reviewability and delivery speed were prioritized over exhaustive robustness.

## Assumptions

The current design assumes all of the following are true:

- a confession has at most one attachment
- the moderator log channel exists for active attachment-bearing flows
- the moderator log message is a sufficiently durable storage anchor in practice
- duplicate Discord interaction delivery is handled by producer-side event deduplication on `interactionId`
- missing durable attachments on modern attachment-bearing confessions should be exceptional
- moderators can use the log message as the canonical reference for attachment-bearing confessions

If any of these assumptions stop being true, this design should be revisited.

## Limitations

These limitations are intentional unless explicitly revised later.

- Durable attachment persistence is coupled to the moderator log message.
- Legacy ephemeral-only attachments are not backfilled.
- Approval and resend do not attempt to reupload missing legacy attachments.
- The system does not preserve attachments independently of Discord.
- The system does not support multiple attachments per confession.
- The system does not attempt to reconcile deleted moderator log artifacts.
- Durable upload failures are allowed to fail into the Inngest DLQ.

## Maintainer Guidance

If you touch attachment-related code, preserve the following mental model:

- `ephemeral_attachment` is the original upload record
- `durable_attachment` is the stable render record
- `process-confession-submission` is the only place where ephemeral download and durable upgrade should happen
- post-log rendering should read durable attachment data only
- resend and approval are not reupload paths
- approval is a split flow: synchronous durable-attachment lookup and moderator-log update in the interaction handler, followed by async public dispatch in `dispatch-approval`

When evaluating a proposed change, ask:

1. Does it accidentally reintroduce rendering from the original ephemeral URL?
2. Does it violate the log-first then durable-persist then public-dispatch ordering?
3. Does it weaken the single-attachment assumption without updating the rest of the system?
4. Does it add robustness complexity that the current design explicitly chose not to carry?
5. Does it preserve moderator-friendly handling for legacy attachment rows?

If the answer to any of those is unclear, the change probably needs more design work before implementation.
