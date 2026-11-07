resource "aws_ecr_repository" "builder" {
  name         = "builder-server"
  force_delete = true
}

resource "aws_cloudwatch_log_group" "builder" {
  name              = "/ecs/${var.name}-builder"
  retention_in_days = 7
}

resource "aws_ecs_cluster" "main" {
  name = var.name
}

resource "random_password" "builder_callback" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "builder_callback_token" {
  name  = "/${var.name}/BUILDER_CALLBACK_TOKEN"
  type  = "SecureString"
  value = random_password.builder_callback.result
}

# SSM rejects empty values, so only create the PAT parameter when provided.
resource "aws_ssm_parameter" "git_pat_token" {
  count = var.git_pat_token != "" ? 1 : 0
  name  = "/${var.name}/GIT_PAT_TOKEN"
  type  = "SecureString"
  value = var.git_pat_token
}

resource "aws_ssm_parameter" "uploader_access_key_id" {
  count = var.create_uploader_iam_user ? 1 : 0
  name  = "/${var.name}/UPLOADER_AWS_ACCESS_KEY_ID"
  type  = "SecureString"
  value = aws_iam_access_key.uploader[0].id
}

resource "aws_ssm_parameter" "uploader_secret_access_key" {
  count = var.create_uploader_iam_user ? 1 : 0
  name  = "/${var.name}/UPLOADER_AWS_SECRET_ACCESS_KEY"
  type  = "SecureString"
  value = aws_iam_access_key.uploader[0].secret
}

locals {
  builder_secrets = concat(
    [{ name = "BUILDER_CALLBACK_TOKEN", valueFrom = aws_ssm_parameter.builder_callback_token.arn }],
    var.git_pat_token != "" ? [{ name = "GIT_PAT_TOKEN", valueFrom = aws_ssm_parameter.git_pat_token[0].arn }] : [],
    var.create_uploader_iam_user ? [
      { name = "AWS_ACCESS_KEY_ID", valueFrom = aws_ssm_parameter.uploader_access_key_id[0].arn },
      { name = "AWS_SECRET_ACCESS_KEY", valueFrom = aws_ssm_parameter.uploader_secret_access_key[0].arn },
    ] : []
  )
  builder_container_name = "builder-server"
}

resource "aws_ecs_task_definition" "builder" {
  family                   = "builder-server-task"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.builder_cpu
  memory                   = var.builder_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.builder_task.arn

  container_definitions = jsonencode([{
    name      = local.builder_container_name
    image     = "${aws_ecr_repository.builder.repository_url}:${var.builder_image_tag}"
    essential = true

    environment = [
      { name = "AWS_REGION", value = var.aws_region },
      # builder-server's S3 client uses forcePathStyle with this endpoint.
      { name = "AWS_ENDPOINT_URL", value = "https://s3.${var.aws_region}.amazonaws.com" },
      { name = "AWS_BUCKET_NAME", value = aws_s3_bucket.outputs.bucket },
      { name = "LAMBDA_EXECUTION_ROLE_ARN", value = aws_iam_role.deployed_lambda.arn },
      { name = "REDIS_URL", value = local.redis_url },
      { name = "WEB_BASE_URL", value = var.web_base_url },
    ]
    secrets = local.builder_secrets

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.builder.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "builder"
      }
    }
  }])
}
