resource "aws_iam_role" "deployed_lambda" {
  name               = "${var.name}-deployed-lambda"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "deployed_lambda_logs" {
  role       = aws_iam_role.deployed_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "deployed_lambda_s3" {
  name = "read-output-assets"
  role = aws_iam_role.deployed_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject"]
      Resource = "${aws_s3_bucket.outputs.arn}/__outputs/*"
    }]
  })
}
