data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Pulls the image, writes logs, reads SSM secrets.
resource "aws_iam_role" "task_execution" {
  name               = "${var.name}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "task_execution_ssm" {
  name = "read-ssm-secrets"
  role = aws_iam_role.task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["ssm:GetParameters"]
      Resource = concat(
        [aws_ssm_parameter.builder_callback_token.arn],
        aws_ssm_parameter.git_pat_token[*].arn,
        aws_ssm_parameter.uploader_access_key_id[*].arn,
        aws_ssm_parameter.uploader_secret_access_key[*].arn
      )
    }]
  })
}

# Credentials the builder container itself runs with (uploads dist/ to S3).
resource "aws_iam_role" "builder_task" {
  name               = "${var.name}-builder-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy" "builder_s3" {
  name = "upload-outputs"
  role = aws_iam_role.builder_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject"]
      Resource = [
        "${aws_s3_bucket.outputs.arn}/__outputs/*",
        "${aws_s3_bucket.outputs.arn}/__lambdas/*",
      ]
    }]
  })
}

resource "aws_iam_role_policy" "builder_lambda" {
  name = "manage-deployed-lambdas"
  role = aws_iam_role.builder_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:CreateFunctionUrlConfig",
        "lambda:GetFunction",
        "lambda:DeleteFunction",
        "lambda:InvokeFunction",
      ]
      Resource = "*"
    }, {
      Effect   = "Allow"
      Action   = ["iam:PassRole"]
      Resource = aws_iam_role.deployed_lambda.arn
    }]
  })
}

# Credentials for the Next.js app so queue-build.ts can call ecs:RunTask.
resource "aws_iam_user" "web" {
  count = var.create_web_iam_user ? 1 : 0
  name  = "${var.name}-web"
}

resource "aws_iam_user_policy" "web" {
  count = var.create_web_iam_user ? 1 : 0
  name  = "run-builder-task"
  user  = aws_iam_user.web[0].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecs:RunTask"]
        Resource = "${aws_ecs_task_definition.builder.arn_without_revision}:*"
        Condition = {
          ArnEquals = { "ecs:cluster" = aws_ecs_cluster.main.arn }
        }
      },
      {
        Effect   = "Allow"
        Action   = ["ecs:DescribeTasks", "ecs:StopTask"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [aws_iam_role.task_execution.arn, aws_iam_role.builder_task.arn]
      }
    ]
  })
}

resource "aws_iam_access_key" "web" {
  count = var.create_web_iam_user ? 1 : 0
  user  = aws_iam_user.web[0].name
}

# Credentials the builder script uses to upload dist/ to S3 (injected into the
# task via SSM, mirroring the AWS_ACCESS_KEY_ID/SECRET env used by register-task.sh).
resource "aws_iam_user" "uploader" {
  count = var.create_uploader_iam_user ? 1 : 0
  name  = "${var.name}-s3-uploader"
}

resource "aws_iam_user_policy" "uploader" {
  count = var.create_uploader_iam_user ? 1 : 0
  name  = "upload-outputs"
  user  = aws_iam_user.uploader[0].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject"]
      Resource = [
        "${aws_s3_bucket.outputs.arn}/__outputs/*",
        "${aws_s3_bucket.outputs.arn}/__lambdas/*",
      ]
    }]
  })
}

resource "aws_iam_access_key" "uploader" {
  count = var.create_uploader_iam_user ? 1 : 0
  user  = aws_iam_user.uploader[0].name
}
