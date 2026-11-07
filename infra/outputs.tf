locals {
  database_url = "postgresql://${aws_db_instance.main.username}:${random_password.db.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}?sslmode=require"

  web_env_lines = concat(
    [
      "DATABASE_URL=\"${local.database_url}\"",
      "REDIS_URL=\"${local.redis_url}\"",
      "BUILDER_CALLBACK_TOKEN=\"${random_password.builder_callback.result}\"",
      "AWS_REGION=\"${var.aws_region}\"",
      "AWS_ENDPOINT_URL=\"https://ecs.${var.aws_region}.amazonaws.com\"",
      "ECS_CLUSTER=\"${aws_ecs_cluster.main.name}\"",
      "ECS_TASK_DEFINITION=\"${aws_ecs_task_definition.builder.family}\"",
      "ECS_CONTAINER_NAME=\"${local.builder_container_name}\"",
      "ECS_LAUNCH_TYPE=\"FARGATE\"",
      "ECS_VPC_SUBNETS=\"${join(",", aws_subnet.public[*].id)}\"",
      "ECS_SECURITY_GROUPS=\"${aws_security_group.builder.id}\"",
      "LAMBDA_EXECUTION_ROLE_ARN=\"${aws_iam_role.deployed_lambda.arn}\"",
    ],
    var.create_web_iam_user ? [
      "AWS_ACCESS_KEY_ID=\"${aws_iam_access_key.web[0].id}\"",
      "AWS_SECRET_ACCESS_KEY=\"${aws_iam_access_key.web[0].secret}\"",
    ] : []
  )

  preview_env_lines = [
    "PORT=${var.preview_port}",
    "S3_BASE_URL=\"https://${aws_s3_bucket.outputs.bucket_regional_domain_name}/__outputs\"",
  ]

  web_env     = join("\n", local.web_env_lines)
  preview_env = join("\n", local.preview_env_lines)
}

# Written to infra/generated/ (gitignored) so nothing in your repo is overwritten.
resource "local_sensitive_file" "web_env" {
  filename        = "${path.module}/generated/web.env"
  content         = "${local.web_env}\n"
  file_permission = "0600"
}

resource "local_sensitive_file" "preview_env" {
  filename = "${path.module}/generated/preview.env"
  content  = "${local.preview_env}\n"
}

# `nonsensitive` so the values print at the end of `terraform apply`.
# They are in the state file regardless; remove nonsensitive() to mask them.
output "web_env" {
  description = "Paste into apps/web/.env"
  value       = nonsensitive(local.web_env)
}

output "preview_env" {
  description = "Paste into apps/preview/.env"
  value       = nonsensitive(local.preview_env)
}

output "builder_image_push" {
  description = "Build and push the builder image (run from the repo root)"
  value       = <<-EOT
    aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${aws_ecr_repository.builder.registry_id}.dkr.ecr.${var.aws_region}.amazonaws.com
    docker build -t ${aws_ecr_repository.builder.repository_url}:${var.builder_image_tag} packages/builder-server
    docker push ${aws_ecr_repository.builder.repository_url}:${var.builder_image_tag}
  EOT
}

output "lambda_execution_role_arn" {
  value = aws_iam_role.deployed_lambda.arn
}

output "next_steps" {
  value = <<-EOT

    1. Push the builder image (from repo root):
         terraform -chdir=infra output -raw builder_image_push | sh
    2. Copy env files:
         cp infra/generated/web.env apps/web/.env
         cp infra/generated/preview.env apps/preview/.env
    3. Create DB schema:   pnpm --filter web db:update && pnpm --filter web db:seed
    4. Run the apps:       pnpm dev   (web must be reachable at ${var.web_base_url})
    5. Builder logs:       CloudWatch log group ${aws_cloudwatch_log_group.builder.name}
  EOT
}

output "uploader_credentials" {
  description = "S3 uploader IAM user (already injected into the builder task)"
  value = var.create_uploader_iam_user ? {
    user              = aws_iam_user.uploader[0].name
    access_key_id     = aws_iam_access_key.uploader[0].id
    secret_access_key = nonsensitive(aws_iam_access_key.uploader[0].secret)
  } : null
}

output "resources" {
  value = {
    s3_bucket     = aws_s3_bucket.outputs.bucket
    ecr_repo      = aws_ecr_repository.builder.repository_url
    ecs_cluster   = aws_ecs_cluster.main.name
    rds_endpoint  = aws_db_instance.main.address
    redis_managed = local.create_redis
  }
}
