# Controlled lab cleanup and rollback

This is a runbook, not a record of execution. No cleanup rehearsal has occurred. Do not delete resources outside the verified ownership inventory.

## Preconditions and inventory

1. Stop lab traffic; preserve manifests, test evidence, current stack template/outputs and previous frontend build. Verify STS account `303278700480`, region `us-east-1`, stack `flashrush-lab`, Project=FLASHRUSH tag. Stop on mismatch. Use explicit `--profile dropit-admin --region us-east-1` on every regional command.
2. Export `aws cloudformation describe-stacks --stack-name flashrush-lab` and `aws cloudformation list-stack-resources --stack-name flashrush-lab`. List SNS subscriptions by the exact AlertsTopicArn output. Record subscription ARN and owner; do not unsubscribe shared/unknown subscriptions.
3. Record event-source-mapping UUID from stack inventory. Inspect S3 versioning, object versions, current objects and incomplete multipart uploads for the WebsiteBucket output and separately owned artifact bucket. Check artifact references from every deployment before deletion. Never construct delete targets from an unverified prefix alone.

## Execution after cleanup authorization

1. Disable only the recorded mapping with `aws lambda update-event-source-mapping --uuid <verified-uuid> --no-enabled`. Record remaining queue/DLQ messages and PENDING orders; preserve evidence before deletion.
2. Empty only the verified WebsiteBucket. For an unversioned bucket, `aws s3 rm s3://<verified-website-bucket>/ --recursive` removes objects. For versioned buckets, enumerate and delete exact versions and delete markers with S3 APIs; removing current objects alone is insufficient. Abort owned incomplete multipart uploads. Re-list to verify empty.
3. Delete only the verified stack: `aws cloudformation delete-stack --stack-name flashrush-lab`, then `aws cloudformation wait stack-delete-complete --stack-name flashrush-lab`. If DELETE_FAILED, inspect stack events and resolve the specific blocker; do not broaden deletion scope. CloudFront teardown can take time.
4. Verify whether the recorded subscription remains. Remove only an owned orphan subscription if it still exists. Do not treat PendingConfirmation text as a deletable ARN.
5. Once no stack references remain, empty the separately owned artifact bucket using the same version-aware procedure, then delete that exact bucket. Do not delete AWS profiles, credentials, DropIt resources or unrelated buckets.

## Verification

Check every physical ID from the saved inventory with its service API; confirm missing stack, functions/mapping, tables, queues, logs/alarms, topic/subscription, distribution/OAC and both buckets. Distinguish AccessDenied from NotFound. Record remaining resources, errors and UTC. Review billing after AWS cost data refresh; immediate empty inventory is not proof of zero charges. Archive redacted evidence outside resources being deleted.

## Frontend rollback

Retain the previous dist directory and its hash manifest before publishing. Verify its API environment matches the guarded target. Upload its assets first, index.html last using the same content types/cache policies; invalidate CloudFront; verify index and referenced assets return correct content types and hashes. Do not delete older hashed assets while rollback may reference them. Catalog seeding is separate and not undone by frontend rollback. Rehearse only within authorized live scope.

When rolling back F10, stop new multi-product intake and keep a v2-compatible worker until the queue, DLQ and pending orders have been reconciled. See the [F10 rollout notes](../features/F10-atomic-cart-checkout.md).
