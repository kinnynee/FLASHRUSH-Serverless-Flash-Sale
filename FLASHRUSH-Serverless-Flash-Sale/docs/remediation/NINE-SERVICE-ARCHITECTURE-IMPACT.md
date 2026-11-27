# AWS service count and architecture impact

The original workshop's nine application services are DynamoDB, SQS, IAM, Lambda, API Gateway, S3, CloudFront, SNS and CloudWatch. Cognito already exists in the current application and is a distinct tenth service. It is not part of IAM.

This remediation preserves Cognito and adds no further AWS application service. CloudFormation remains the existing provisioning mechanism; the count of ten uses the workshop's application-service convention, not a claim that only ten AWS APIs/tools exist.

Update the architecture diagram to show browser -> Cognito, browser bearer token -> API Gateway JWT authorizer -> Lambda, with backend live identity/group checks for staff, customer-data and voucher tables, and SQS -> Worker -> atomic stock/order/voucher transaction. Keep IAM execution roles and Cognito business roles separate.

For a strict nine-service assignment, use one of these separately reviewed options:

1. Prefer documenting the original nine-service flash-sale core plus a Cognito extension, with the actual deployed total explicitly ten.
2. Submit an educational nine-service guest-only scope with customer/staff authentication features omitted from that scope. This changes requirements and needs approval; the current app was not downgraded.
3. Evaluate an external identity provider as a separate architecture decision, including cost/security/operational implications. Replacing Cognito is a migration, not a simple count correction.

No identity-provider migration, service deletion, cost estimate or live deployment evidence was produced by this task.
